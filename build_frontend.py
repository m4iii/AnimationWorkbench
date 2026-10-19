"""Build the self-contained frontend prototype. No service or backend is started."""
from pathlib import Path
import base64
import json
import xml.etree.ElementTree as ET
from urllib.parse import quote

HERE = Path(__file__).resolve().parent

def safe_json(value):
    return json.dumps(value, ensure_ascii=False).replace('<', '\\u003c').replace('>', '\\u003e').replace('&', '\\u0026')

def main():
    media = {}  # Public distribution starts empty; no third-party artwork.
    functions = json.loads((HERE/'frontend/function-map.json').read_text(encoding='utf-8'))
    template = (HERE/'frontend/index.template.html').read_text(encoding='utf-8')
    html = template.replace('__FUNCTION_MAP__', safe_json(functions)).replace('__SAMPLE_MEDIA__', safe_json(media))
    html = html.replace('__CORE_JS__', (HERE/'frontend/core.js').read_text(encoding='utf-8'))
    html = html.replace('__PICKER_PROBE_JS__', (HERE/'frontend/picker-probe.js').read_text(encoding='utf-8'))
    html = html.replace('__WORKSPACE_JS__', (HERE/'frontend/workspace-store.js').read_text(encoding='utf-8'))
    html = html.replace('__TASK_PANEL_JS__', (HERE/'frontend/task-panel.js').read_text(encoding='utf-8'))
    html = html.replace('__BACKEND_JS__', (HERE/'frontend/backend-client.js').read_text(encoding='utf-8'))
    html = html.replace('__ANIMATION_METADATA_JS__', (HERE/'frontend/animation-metadata.js').read_text(encoding='utf-8'))
    html = html.replace('__MOTION_JS__', (HERE/'frontend/motion-input.js').read_text(encoding='utf-8'))
    html = html.replace('__TIMELINE_JS__', (HERE/'frontend/timeline.js').read_text(encoding='utf-8'))
    html = html.replace('__LAYOUT_JS__', (HERE/'frontend/editor-layout.js').read_text(encoding='utf-8')).replace('__STUDIO_CSS__', (HERE/'frontend/studio.css').read_text(encoding='utf-8'))
    html = html.replace('__SELECTION_JS__', (HERE/'frontend/frame-selection.js').read_text(encoding='utf-8')).replace('__APP_JS__', (HERE/'frontend/unified-app.js').read_text(encoding='utf-8'))
    icon_dir = HERE/'frontend/vendor/lucide'
    icons = {}
    for path in sorted(icon_dir.glob('*.svg')):
        svg = path.read_text(encoding='utf-8')
        root = ET.fromstring(svg)
        for element in root.iter():
            assert element.tag.split('}')[-1] in {'svg','path','rect','circle','ellipse','line','polyline','polygon','g'}, path
            assert all(not name.lower().startswith('on') and 'href' not in name.lower() for name in element.attrib), path
        icons[path.stem] = svg
    html = html.replace('__ICON_DATA__', safe_json(icons)).replace('__ICON_LICENSE__', safe_json((icon_dir/'LICENSE').read_text(encoding='utf-8'))).replace('__ICONS_JS__', (HERE/'frontend/ui-icons.js').read_text(encoding='utf-8'))
    chevron = 'data:image/svg+xml,' + quote(icons['chevron-down'].replace('currentColor', '#a8a9b6'), safe='')
    controls = (HERE/'frontend/controls.css').read_text(encoding='utf-8').replace('__CHEVRON_DATA__', chevron)
    html = html.replace('__CONTROLS_CSS__', controls).replace('__CONTROLS_JS__', (HERE/'frontend/ui-controls.js').read_text(encoding='utf-8'))
    html = html.replace('__VIDEO_FPS_JS__', (HERE/'frontend/video-frame-rate.js').read_text(encoding='utf-8')).replace('__WEBM_FPS_JS__', (HERE/'frontend/webm-frame-rate.js').read_text(encoding='utf-8'))
    html = html.replace('__MARQUEE_JS__', (HERE/'frontend/frame-marquee.js').read_text(encoding='utf-8'))
    assert all(token not in html for token in ['__FUNCTION_MAP__','__SAMPLE_MEDIA__','__CORE_JS__','__MOTION_JS__','__TIMELINE_JS__','__LAYOUT_JS__','__STUDIO_CSS__','__SELECTION_JS__','__APP_JS__','__ICON_DATA__','__ICON_LICENSE__','__ICONS_JS__','__CONTROLS_CSS__','__CONTROLS_JS__','__CHEVRON_DATA__','__VIDEO_FPS_JS__','__WEBM_FPS_JS__','__MARQUEE_JS__'])
    output = HERE/'AnimationWorkbench.html'
    output.write_text(html, encoding='utf-8')
    lines = ['# 前端功能对照（统一动作工作区）', '',
      '本表由 `frontend/function-map.json` 生成，与 HTML 内的“功能对照”面板共用同一份定义。', '',
      '**本机后端已提供素材、原帧提取、Codex 任务与产物接口。未连接时不执行生成。** 流程演示按钮仍模拟操作；文件选择、视频截帧、图集切分、帧排序、提示词编辑、配置下载和既有视频播放属于真实前端功能。', '',
      '## 工作区交互', '',
      '左侧导入素材，中央查看源画面或当前帧候选，右侧编辑属性与提示词，底部直接添加、选择、多选和标记重绘帧。六步分页已撤除。', '',
      '选中状态只决定当前操作对象；重绘标记是持久帧属性。二者分开记录，全部使用稳定帧ID关联。', '',
      '提示词支持项目默认与单帧覆盖；生成提示词与生图是两次独立操作，两套new/resume参数分别保存。', '',
      '## 功能明细', '', '| ID | 界面操作 | 当前前端行为 | 未来后端职责与接口 |', '|---|---|---|---|']
    def cell(s): return s.replace('|','\\|').replace('\n','<br>')
    for f in functions:
        lines.append('| `'+f['id']+'` | '+cell(f['label'])+' | '+cell(f['ui'])+' | '+cell(f['backend'])+'<br>`'+cell(f['api'])+'` |')
    lines += ['', '## 模拟与数据保存边界', '',
      '- 视频采样、切图、帧选择和标记是实际前端操作；提示词优化和生图接入本机 Codex 后端，动画导出未实现。',
      '- 候选图可手动导入，用于单帧评审，页面明确标注来源；模拟生图不会将既有图片伪装为新结果。',
      '- 配置JSON含帧元数据、重绘标记、提示词和会话选项，不含图片/视频。重新打开需要导入素材；当前不会自动恢复帧图片或候选。',
      '- 流程演示只演示停止/继续的状态，藏在更多菜单，不作为编辑器导航。',
      '- 后端直接提供工作台 HTML，打开本机端口后自动连接同源 API；仅监听 127.0.0.1。', '']
    (HERE/'FRONTEND_FUNCTIONS.md').write_text('\n'.join(lines), encoding='utf-8')
    print(json.dumps({'html':str(output),'bytes':output.stat().st_size,'functions':len(functions),'external_media_requests':0},ensure_ascii=False))

if __name__ == '__main__': main()
