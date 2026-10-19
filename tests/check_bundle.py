"""Static bundle checks only; scripts/check.py runs JavaScript regression suites."""
from pathlib import Path
from html.parser import HTMLParser
import base64,json,re,subprocess

D=Path(__file__).resolve().parents[1]
class Parser(HTMLParser):
    def __init__(self):
        super().__init__();self.ids=[];self.actions=[];self.sources=[];self.scripts=[];self.current=None
    def handle_starttag(self,tag,attrs):
        a=dict(attrs)
        if a.get('id'):self.ids.append(a['id'])
        if a.get('data-action'):self.actions.append(a['data-action'])
        if tag in ['script','img','video','link']:
            src=a.get('src',a.get('href'))
            if src:self.sources.append(src)
        if tag=='script':self.current={'type':a.get('type','text/javascript'),'id':a.get('id'),'text':''}
    def handle_data(self,data):
        if self.current is not None:self.current['text']+=data
    def handle_endtag(self,tag):
        if tag=='script' and self.current is not None:self.scripts.append(self.current);self.current=None

html=(D/'AnimationWorkbench.html').read_text(encoding='utf-8')
p=Parser();p.feed(html)
assert len(p.ids)==len(set(p.ids)),'duplicate HTML IDs'
fmap=json.loads(next(x['text'] for x in p.scripts if x['id']=='function-map'))
ids={f['id'] for f in fmap};assert len(ids)==len(fmap)
assert set(p.actions)<=ids,'button missing from function map'
js='\n'.join(x['text'] for x in p.scripts if x['type']=='text/javascript')
dom_ids=set(re.findall(r"\$\('([\w-]+)'\)",js))
assert dom_ids<=set(p.ids),dom_ids-set(p.ids)
motion_refs=set(re.findall(r"(?:this\.)?q\('([\w-]+)'\)",js))
motion_slots=set(re.findall(r'data-mi="([\w-]+)"',js))
assert motion_refs<=motion_slots,motion_refs-motion_slots
assert 'view-poses' not in p.ids and 'view-sampling' not in p.ids,'legacy split frame pages still present'
assert not p.sources,'External static src/href dependency found'
network_scripts=[x['text'] for x in p.scripts if 'fetch(' in x['text']]
assert len(network_scripts)==1 and 'class Client' in network_scripts[0], 'Network access must stay in same-origin backend client'
assert "this.base=location.origin" in network_scripts[0]
assert "['127.0.0.1','localhost'].includes(location.hostname)" in network_scripts[0]
assert "if(!this.token)throw" in network_scripts[0]
media=json.loads(next(x['text'] for x in p.scripts if x['id']=='sample-media'))
sizes={}
for k,url in media.items():
    assert url.startswith('data:') and ';base64,' in url
    prefix,data=url.split(',',1);raw=base64.b64decode(data,validate=True);assert raw
    if prefix.startswith('data:image/png'):assert raw.startswith(b'\x89PNG\r\n\x1a\n')
    if prefix.startswith('data:video/mp4'):assert b'ftyp' in raw[:32]
    sizes[k]=len(raw)
for script in [x for x in p.scripts if x['type']=='text/javascript']:
    proc=subprocess.run(['node','-e',"const vm=require('node:vm');let s='';process.stdin.setEncoding('utf8');process.stdin.on('data',x=>s+=x);process.stdin.on('end',()=>{new vm.Script(s);console.log('syntax ok')});"],input=script['text'],text=True,capture_output=True,encoding='utf-8')
    assert proc.returncode==0,proc.stderr
motion_actions=set(re.findall(r"(?:action\(|onAction\()'([^']+)'",js))
assert motion_actions<=ids,motion_actions-ids
report={'html':str((D/'AnimationWorkbench.html').resolve()),'html_bytes':(D/'AnimationWorkbench.html').stat().st_size,
    'function_count':len(fmap),'mapped_button_actions':len(set(p.actions)),'unique_dom_ids':len(p.ids),
    'constant_dom_references_resolve':True,'embedded_media_bytes':sizes,'external_resources':0,
    'network_calls':'explicit loopback backend client only','script_syntax':'passed',
    'browser_rendering':'Not covered by this static and unit test suite; validate the running loopback UI separately.'}
(D/'tests/verification.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(report,ensure_ascii=False,indent=2))
