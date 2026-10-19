"""Real loopback transport and FFmpeg tests; model calls use an explicit test double."""
import concurrent.futures
import io
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import threading
import time
import unittest
import urllib.request
import urllib.error
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))
from server import Store, Jobs, make_server, APIError, CodexWorker, DEFAULT_GENERATION_PROMPT
from PIL import Image
from workspaces import Workspaces
from server import atomic_json


class Worker:
    executable = 'test-double'
    def __init__(self):
        self.active = self.peak = 0
        self.lock = threading.Lock()
        self.delay = .04
    def run(self, kind, payload, frame, images, directory, cancel):
        with self.lock:
            self.active += 1
            self.peak = max(self.peak, self.active)
        try:
            cancel.wait(self.delay)
            if cancel.is_set():
                raise APIError('cancelled')
            if frame['prompt'] == 'fail':
                raise APIError('test failure')
            if kind == 'prompt':
                path = directory / 'answer.txt'
                path.write_text('test-only optimized prompt', encoding='utf-8')
            else:
                path = directory / 'result.png'
                Image.new('RGB', (7, 9), 'red').save(path)
            return path
        finally:
            with self.lock:
                self.active -= 1


class BackendTests(unittest.TestCase):
    def setUp(self):
        test_root=Path(__file__).resolve().parents[1]/'backend'/'.runtime'
        test_root.mkdir(exist_ok=True)
        self.temp = tempfile.TemporaryDirectory(dir=test_root)
        self.store = Store(self.temp.name)
        self.worker = Worker()
        self.jobs = Jobs(self.store, self.worker, limit=2)
        self.server = make_server(self.store, self.jobs, 'test-token')
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.base = f'http://127.0.0.1:{self.server.server_port}'
    def tearDown(self):
        for cancel in self.jobs.cancels.values():
            cancel.set()
        deadline = time.monotonic()+5
        while any(j['status'] not in ('completed','partial','failed','cancelled') for j in self.jobs.jobs.values()) and time.monotonic()<deadline:
            time.sleep(.01)
        self.server.shutdown()
        self.thread.join()
        self.server.server_close()
        self.jobs.pool.shutdown()
        self.temp.cleanup()
    def request(self, route, data=None, token='test-token', origin=None, raw=False, method=None):
        body = data if raw else None if data is None else json.dumps(data).encode()
        req = urllib.request.Request(self.base+route, body, method=method, headers={'Authorization':'Bearer '+token, 'Origin':origin or self.base, 'Content-Type':'application/octet-stream' if raw else 'application/json'})
        return urllib.request.urlopen(req)
    def image_asset(self):
        buf=io.BytesIO();Image.new('RGBA',(32,24),(10,20,30,100)).save(buf,format='PNG')
        return json.load(self.request('/assets?name=original.png',buf.getvalue(),raw=True))['assetId']
    def wait(self, identity):
        deadline=time.monotonic()+10
        while time.monotonic()<deadline:
            state=json.load(self.request('/jobs/'+identity))
            if state['status'] in ('completed','partial','failed','cancelled'):
                return state
            time.sleep(.02)
        self.fail('job timeout')
    def test_auth_origin_preflight(self):
        for kwargs, code in [({'token':'wrong'},401),({'origin':'https://example.org'},403),({'origin':'null'},403)]:
            with self.assertRaises(urllib.error.HTTPError) as err:
                self.request('/capabilities',**kwargs)
            self.assertEqual(err.exception.code,code)
        response=self.request('/capabilities',token='',method='OPTIONS')
        self.assertIsNone(response.headers.get('Access-Control-Allow-Origin'))
        self.assertEqual(json.load(self.request('/capabilities'))['maxConcurrency'],2)
    def test_served_ui_and_loopback_boundary(self):
        response=self.request('/',token='')
        html=response.read().decode('utf-8')
        self.assertIn('text/html',response.headers['Content-Type'])
        self.assertIn('<script id="backend-bootstrap" type="application/json">{"token": "test-token"}</script>',html)
        self.assertNotIn('id="backend-connect"',html)
        self.assertEqual(response.headers['X-Frame-Options'],'DENY')
        self.assertEqual(self.server.server_address[0],'127.0.0.1')
        for headers in [{'Host':'192.168.1.5:'+str(self.server.server_port)},{'Host':'attacker.example:'+str(self.server.server_port)},{'Sec-Fetch-Site':'cross-site'}]:
            req=urllib.request.Request(self.base+'/',headers=headers)
            with self.assertRaises(urllib.error.HTTPError) as err:urllib.request.urlopen(req)
            self.assertEqual(err.exception.code,403)
        with self.assertRaises(urllib.error.HTTPError):self.request('/backend/.runtime/token.txt')

    def test_upload_crop_cache_and_artifact(self):
        identity=self.image_asset()
        self.assertEqual(identity,self.image_asset())
        loc={'kind':'sheet','assetId':identity,'crop':{'x':2,'y':3,'width':9,'height':8}}
        first=json.load(self.request('/frames/extract',{'frames':[loc]}))['frames'][0]
        self.assertEqual(first,self.store.extract(loc))
        with Image.open(io.BytesIO(self.request('/artifacts/'+first['artifactId']).read())) as im:
            self.assertEqual(im.size,(9,8));self.assertEqual(im.getpixel((0,0))[3],100)
        with self.assertRaises(APIError):self.store.path('assets','../token.txt')
        loc['crop']['width']=100
        with self.assertRaises(APIError):self.store.extract(loc)
    def test_real_video_extraction(self):
        if not self.store.ffmpeg:self.skipTest('FFmpeg unavailable')
        path=Path(self.temp.name)/'sample.mp4'
        subprocess.run([self.store.ffmpeg,'-v','error','-f','lavfi','-i','color=c=blue:s=32x24:r=10:d=1','-y',str(path)],check=True,capture_output=True)
        asset=json.load(self.request('/assets?name=clip.mp4',path.read_bytes(),raw=True))['assetId']
        result=self.store.extract({'kind':'video','assetId':asset,'timeSeconds':.3,'frameIndexHint':3,'indexBasis':'presentation_table'})
        self.assertEqual((result['width'],result['height']),(32,24))
        with self.assertRaises(APIError):self.store.extract({'kind':'video','assetId':asset,'timeSeconds':90})
    def test_prompt_and_partial_generation(self):
        asset=self.image_asset();loc={'assetId':asset,'kind':'image'}
        job=json.load(self.request('/prompt-jobs',{'prompt':'keep pose','locator':loc,'references':[{'assetId':asset,'role':'style'}]}))
        state=self.wait(job['id']);self.assertEqual(state['status'],'completed')
        listing=json.load(self.request('/jobs'))['jobs']
        self.assertTrue(any(j['id']==job['id'] and j['status']=='completed' for j in listing))
        self.assertIsInstance(state['createdAt'],float)
        self.assertEqual(self.request('/artifacts/'+state['items'][0]['result']['artifactId']).read(),b'test-only optimized prompt')
        frames=[{'frameId':str(i),'prompt':'fail' if i==1 else 'draw','locator':loc} for i in range(4)]
        job=json.load(self.request('/generation-jobs',{'frames':frames,'concurrency':9}))
        self.assertEqual(job['concurrency'],2)
        state=self.wait(job['id']);self.assertEqual(state['status'],'partial')
        self.assertEqual(sum(i['status']=='completed' for i in state['items']),3)
        self.assertLessEqual(self.worker.peak,2)
    def test_cancel_and_restart(self):
        self.worker.delay=2
        asset=self.image_asset();frames=[{'frameId':str(i),'prompt':'draw','locator':{'assetId':asset,'kind':'image'}} for i in range(5)]
        job=json.load(self.request('/generation-jobs',{'frames':frames,'concurrency':2}))
        self.request('/jobs/'+job['id']+'/cancel',{})
        state=self.wait(job['id']);self.assertEqual(state['status'],'cancelled')
        self.assertTrue(all(i['status']=='cancelled' for i in state['items']))
        other=Jobs(self.store,Worker());self.assertEqual(other.get(job['id'])['status'],'cancelled');other.pool.shutdown()
    def test_empty_generation_prompt_defaults(self):
        asset=self.image_asset();locator={'assetId':asset,'kind':'image'}
        frames=[{'frameId':str(i),'locator':locator,**({'prompt':value} if value is not None else {})} for i,value in enumerate(['','   \n',None,'用户指定画风'])]
        job=json.load(self.request('/generation-jobs',{'frames':frames,'references':[{'assetId':asset,'role':'style'}]}))
        state=self.wait(job['id']);self.assertEqual(state['status'],'completed')
        saved=json.loads((self.store.root/'jobs'/job['id']/'request.json').read_text(encoding='utf-8'))
        self.assertEqual([f['prompt'] for f in saved['frames']], [DEFAULT_GENERATION_PROMPT]*3+['用户指定画风'])
        self.assertEqual(saved['references'][0]['assetId'],asset)

    def test_character_only_ignores_legacy_weapon_setting(self):
        asset=self.image_asset()
        job=json.load(self.request('/prompt-jobs',{'prompt':'人物与武器分开生成','separateWeapon':True,'references':[{'assetId':asset,'role':'character'},{'assetId':asset,'role':'weapon'}]}))
        self.wait(job['id'])
        saved=json.loads((self.store.root/'jobs'/job['id']/'request.json').read_text(encoding='utf-8'))
        self.assertNotIn('separateWeapon',saved)
        self.assertEqual(saved['outputTarget'],'character_without_weapon')
        self.assertEqual([r['role'] for r in saved['references']],['character'])

    def test_details_preserve_submitted_prompt_and_exact_snapshot(self):
        job=json.load(self.request('/prompt-jobs',{'prompt':'当次原始要求','model':'gpt-6.1-sol','reasoningEffort':'low'}))
        state=self.wait(job['id'])
        detail=json.load(self.request('/jobs/'+job['id']+'/details'))
        self.assertEqual(detail['items'][0]['prompt'],'当次原始要求')
        self.assertEqual(detail['settings']['model'],'gpt-6.1-sol')
        self.assertIsNone(detail['items'][0]['sentPrompt'],'legacy/test jobs must not invent full prompts')
        self.assertEqual(detail['items'][0]['result'],state['items'][0]['result'])
        snapshot=self.store.root/'jobs'/job['id']/'0'/'sent-prompt.txt'
        snapshot.write_text('真实完整指令快照',encoding='utf-8')
        self.assertEqual(json.load(self.request('/jobs/'+job['id']+'/details'))['items'][0]['sentPrompt'],'真实完整指令快照')
        with self.assertRaises(urllib.error.HTTPError):self.request('/jobs/not-a-job/details')

    def test_workspace_cache_single_slot_and_conflict(self):
        asset=self.image_asset()
        snapshot={'schemaVersion':1,'config':{'draft':'first'},'motion':{'sources':[{'assetId':asset}]}}
        self.assertEqual(json.load(self.request('/workspace-cache'))['revision'],0)
        self.assertEqual(json.load(self.request('/workspace-cache',{'revision':0,'snapshot':snapshot}))['revision'],1)
        snapshot['config']['draft']='second'
        self.request('/workspace-cache',{'revision':1,'snapshot':snapshot})
        loaded=json.load(self.request('/workspace-cache'))
        self.assertEqual(loaded['snapshot']['config']['draft'],'second')
        self.assertEqual(len(list(self.store.root.glob('workspace-cache.json'))),1)
        with self.assertRaises(urllib.error.HTTPError) as err:self.request('/workspace-cache',{'revision':0,'snapshot':snapshot})
        self.assertEqual(err.exception.code,409)
        self.assertEqual(self.request('/assets/'+asset).read(),self.store.path('assets',asset).read_bytes())

    def test_named_workspaces_are_portable_and_independent(self):
        asset=self.image_asset();workspaces=Workspaces(self.store,APIError,atomic_json)
        snapshot={'schemaVersion':1,'config':{'draft':'named'},'motion':{'sources':[{'assetId':asset}]}}
        workspaces.save_cache({'revision':0,'snapshot':snapshot})
        saved=workspaces.save_named({'name':'角色A攻击','revision':1})
        snapshot['config']['draft']='temporary'
        workspaces.save_cache({'revision':1,'snapshot':snapshot})
        reopened=workspaces.open_named({'name':'角色A攻击'})['snapshot']
        self.assertEqual(reopened['config']['draft'],'named')
        self.assertEqual(reopened['config']['project'],'角色A攻击')
        workspaces.save_named({'name':'角色B','revision':2})
        self.assertEqual(len(workspaces.list_named()['workspaces']),2)
        self.assertEqual(len(json.load(self.request('/workspaces'))['workspaces']),2)
        workspaces.save_named({'name':'角色A攻击','revision':2})
        self.assertEqual(workspaces.open_named({'name':'角色A攻击'})['snapshot']['config']['draft'],'temporary')
        for name in ['../escape','CON','bad/name']:
            with self.assertRaises(APIError):workspaces.save_named({'name':name,'revision':2})
        with self.assertRaises(APIError):workspaces.save_named({'name':'x','revision':1})
        with self.assertRaises(urllib.error.HTTPError):self.request('/workspaces/choose-directory',{})

    def test_validation(self):
        for data in [{'prompt':''},{'prompt':'a','mode':'resume'},{'prompt':'a','concurrency':0},{'prompt':'a','concurrency':1.5}]:
            with self.assertRaises(urllib.error.HTTPError) as err:self.request('/prompt-jobs',data)
            self.assertIn(err.exception.code,(400,422))


if __name__ == '__main__':unittest.main(verbosity=2)
