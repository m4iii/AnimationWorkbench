"""Static verification of the standalone frontend; not a browser-rendering test."""
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
state_test=subprocess.run(['node',str(D/'tests/frontend-core.cjs')],text=True,capture_output=True,encoding='utf-8')
assert state_test.returncode==0,state_test.stderr
motion_test=subprocess.run(['node',str(D/'tests/motion-input.cjs')],text=True,capture_output=True,encoding='utf-8')
assert motion_test.returncode==0,motion_test.stderr
event_test=subprocess.run(['node',str(D/'tests/timeline-events.cjs')],text=True,capture_output=True,encoding='utf-8')
assert event_test.returncode==0,event_test.stderr
selection_test=subprocess.run(['node',str(D/'tests/unified-selection.cjs')],text=True,capture_output=True,encoding='utf-8')
assert selection_test.returncode==0,selection_test.stderr
integration_test=subprocess.run(['node',str(D/'tests/unified-integration.cjs')],text=True,capture_output=True,encoding='utf-8')
assert integration_test.returncode==0,integration_test.stderr
drag_preview_test=subprocess.run(['node',str(D/'tests/drag-preview.cjs')],text=True,capture_output=True,encoding='utf-8')
assert drag_preview_test.returncode==0,drag_preview_test.stderr
video_rate_test=subprocess.run(['node',str(D/'tests/video-frame-rate.cjs')],text=True,capture_output=True,encoding='utf-8')
assert video_rate_test.returncode==0,video_rate_test.stderr
webm_rate_test=subprocess.run(['node',str(D/'tests/webm-frame-rate.cjs')],text=True,capture_output=True,encoding='utf-8')
assert webm_rate_test.returncode==0,webm_rate_test.stderr
marquee_test=subprocess.run(['node',str(D/'tests/frame-marquee.cjs')],text=True,capture_output=True,encoding='utf-8')
assert marquee_test.returncode==0,marquee_test.stderr
marquee_event_test=subprocess.run(['node',str(D/'tests/frame-marquee-events.cjs')],text=True,capture_output=True,encoding='utf-8')
assert marquee_event_test.returncode==0,marquee_event_test.stderr
clear_selection_test=subprocess.run(['node',str(D/'tests/clear-selection.cjs')],text=True,capture_output=True,encoding='utf-8')
assert clear_selection_test.returncode==0,clear_selection_test.stderr
timeline_marquee_test=subprocess.run(['node',str(D/'tests/timeline-marquee.cjs')],text=True,capture_output=True,encoding='utf-8')
assert timeline_marquee_test.returncode==0,timeline_marquee_test.stderr
frame_layout_test=subprocess.run(['node',str(D/'tests/frame-layout.cjs')],text=True,capture_output=True,encoding='utf-8')
assert frame_layout_test.returncode==0,frame_layout_test.stderr
edge_pan_test=subprocess.run(['node',str(D/'tests/timeline-edge-pan.cjs')],text=True,capture_output=True,encoding='utf-8')
assert edge_pan_test.returncode==0,edge_pan_test.stderr
timeline_range_test=subprocess.run(['node',str(D/'tests/timeline-range.cjs')],text=True,capture_output=True,encoding='utf-8')
assert timeline_range_test.returncode==0,timeline_range_test.stderr
unique_samples_test=subprocess.run(['node',str(D/'tests/unique-samples.cjs')],text=True,capture_output=True,encoding='utf-8')
assert unique_samples_test.returncode==0,unique_samples_test.stderr
thumbnail_test=subprocess.run(['node',str(D/'tests/thumbnail-storage.cjs')],text=True,capture_output=True,encoding='utf-8')
assert thumbnail_test.returncode==0,thumbnail_test.stderr
motion_actions=set(re.findall(r"(?:action\(|onAction\()'([^']+)'",js))
assert motion_actions<=ids,motion_actions-ids
sequence_dedup_test=subprocess.run(['node',str(D/'tests/sequence-dedup.cjs')],text=True,capture_output=True,encoding='utf-8')
assert sequence_dedup_test.returncode==0,sequence_dedup_test.stderr
sequence_hover_fit_test=subprocess.run(['node',str(D/'tests/sequence-hover-fit.cjs')],text=True,capture_output=True,encoding='utf-8')
assert sequence_hover_fit_test.returncode==0,sequence_hover_fit_test.stderr
common_timeline_test=subprocess.run(['node',str(D/'tests/common-timeline.cjs')],text=True,capture_output=True,encoding='utf-8')
assert common_timeline_test.returncode==0,common_timeline_test.stderr
shared_video_renderer_test=subprocess.run(['node',str(D/'tests/shared-video-timeline-render.cjs')],text=True,capture_output=True,encoding='utf-8')
assert shared_video_renderer_test.returncode==0,shared_video_renderer_test.stderr
timeline_hover_preview_test=subprocess.run(['node',str(D/'tests/timeline-hover-preview.cjs')],text=True,capture_output=True,encoding='utf-8')
assert timeline_hover_preview_test.returncode==0,timeline_hover_preview_test.stderr
sheet_workspace_restore_test=subprocess.run(['node',str(D/'tests/sheet-workspace-restore.cjs')],text=True,capture_output=True,encoding='utf-8')
assert sheet_workspace_restore_test.returncode==0,sheet_workspace_restore_test.stderr
duplicate_reference_numbering_test=subprocess.run(['node',str(D/'tests/duplicate-reference-numbering.cjs')],text=True,capture_output=True,encoding='utf-8')
assert duplicate_reference_numbering_test.returncode==0,duplicate_reference_numbering_test.stderr
report={'html':str((D/'AnimationWorkbench.html').resolve()),'html_bytes':(D/'AnimationWorkbench.html').stat().st_size,
    'function_count':len(fmap),'mapped_button_actions':len(set(p.actions)),'unique_dom_ids':len(p.ids),
    'constant_dom_references_resolve':True,'embedded_media_bytes':sizes,'external_resources':0,
    'network_calls':'explicit loopback backend client only','script_syntax':'passed','core_simulation_tests':json.loads(state_test.stdout),
    'motion_input_tests':json.loads(motion_test.stdout),
    'timeline_event_tests':json.loads(event_test.stdout),
    'unified_selection_tests':json.loads(selection_test.stdout),
    'unified_editor_integration_tests':json.loads(integration_test.stdout),
    'drag_preview_tests':json.loads(drag_preview_test.stdout),
    'video_frame_rate_tests':json.loads(video_rate_test.stdout),
    'webm_frame_rate_tests':json.loads(webm_rate_test.stdout),
    'frame_marquee_tests':json.loads(marquee_test.stdout),
    'frame_marquee_event_tests':json.loads(marquee_event_test.stdout),
    'clear_selection_tests':json.loads(clear_selection_test.stdout),
    'timeline_marquee_tests':json.loads(timeline_marquee_test.stdout),
    'frame_layout_tests':json.loads(frame_layout_test.stdout),
    'timeline_edge_pan_tests':json.loads(edge_pan_test.stdout),
    'timeline_range_tests':json.loads(timeline_range_test.stdout),
    'unique_sample_tests':json.loads(unique_samples_test.stdout),
    'thumbnail_storage_tests':json.loads(thumbnail_test.stdout),
    'sequence_dedup_tests':json.loads(sequence_dedup_test.stdout),
    'sequence_hover_fit_tests':json.loads(sequence_hover_fit_test.stdout),
    'common_timeline_tests':json.loads(common_timeline_test.stdout),
    'shared_video_renderer_tests':json.loads(shared_video_renderer_test.stdout),
    'timeline_hover_preview_tests':json.loads(timeline_hover_preview_test.stdout),
    'sheet_workspace_restore_tests':json.loads(sheet_workspace_restore_test.stdout),
    'duplicate_reference_numbering_tests':json.loads(duplicate_reference_numbering_test.stdout),
    'browser_rendering':'Not covered by this static and unit test suite; validate the running loopback UI separately.'}
(D/'tests/verification.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(report,ensure_ascii=False,indent=2))
