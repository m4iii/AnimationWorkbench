
# 动画 JSON 格式规范与最小示例

本节规定当前导入器**实际支持**的结构，不把其他引擎或任意 JSON 宣称为兼容。JSON 必须是 UTF-8，单次最多选择一份，大小不超过 2 MiB。禁止把代码或脚本放进配置执行；导入器不会执行事件、表达式或网络请求。

### 导入方式

- 独立入口：先导入 PNG / 图集，再点素材栏“导入 JSON”，选择配置。它只关联当前已经载入的原始图片。
- 同批入口：通过“帧序列”或“连续图 / 图集”，一次选择图片与 JSON。
- 视频不接受这两种图片时序 JSON。没有关联图片时，单独导入 JSON 会明确要求先导入图片。
- JSON、PNG 文件均不被修改。原始文件保留，配置和原图通过现有工作区缓存保存。

### 格式 A：原动画提取清单

这是现有提取包的兼容结构，没有要求 `format` 或 `schemaVersion` 字段，也不是 Aseprite / TexturePacker 原生 JSON。结构以 `frames` 数组为标识。

必填：

- 顶层 `width`、`height`：完整单帧画布的正整数像素尺寸。
- `frames`：1–200 个帧记录，数组顺序就是播放顺序。
- 每帧 `file`：PNG 相对路径；按文件基名与所选图片匹配，基名必须唯一，不能重复、遗漏或额外混入其他图片。

可选：

- `duration_ms`：每帧正数毫秒；也可用顶层 `durations_ms` 数组。两者都存在时必须逐项一致。必须全帧都有时序，或全帧都没有，不能半有半无。
- `index`：从 0 开始，若提供必须等于数组位置。
- `frame_count`：若提供必须等于 `frames.length`。
- `total_duration_ms`：若提供必须与逐帧时长之和一致。
- `frame` 或 `crop`：`{x,y,w,h}`，也接受 `width` / `height` 代替 `w` / `h`。坐标是原图左上角起算的非负整数像素，右边界和下边界不包含。
- `atlas`：对应图集文件名；提供时必须与所选图集基名相同。
- `columns`、`rows`：必须一起提供，各为 1–200 的整数；乘积不得小于帧数，允许最后一行未填满。用于规则行优先布局。图集导入要求完整规则网格，每帧矩形与实际网格一致；不能凭理想布局猜测当前图片。
- `atlas_width`、`atlas_height`：声明的图集边界；没有时按 `columns × width` / `rows × height` 计算校验边界。导入时另检查全部裁切矩形落在实测 PNG 内，不强制声明尺寸与 PNG 外边界完全相等。
- `sourceSize:{w,h}`、`spriteSourceSize:{x,y,w,h}`、`trimmed`、`rotated`：可读取，但当前这个格式的图片导入路径只接受完整未裁边帧；非零偏移、裁边或旋转明确拒绝，不会静默丢掉偏移。没有这些字段时按完整帧处理。

路径不能是绝对路径、URL、反斜杠路径或含 `..` 的路径。目录只用于清单描述，导入器不会自动访问磁盘目录或网络；实际图片须由用户选择。逐帧图片实测尺寸必须符合 `sourceSize`。

最小可导入示例（不含用户或游戏素材）：先运行 `python examples/json-import/generate_examples.py`，在示例目录生成三张确定性的纯色 PNG。发布仓库不提交栅格图片，PNG 由该脚本本地生成并校验摘要。

```json
{
  "width": 3,
  "height": 4,
  "frames": [
    {"file": "frame_0000.png", "duration_ms": 80},
    {"file": "frame_0001.png", "duration_ms": 120}
  ]
}
```

选择 生成的 `frame_0000.png`、`frame_0001.png` 与完整的 [extracted-manifest.json](../examples/json-import/extracted-manifest.json)，得到 2 引用、0.200 秒。该完整示例也可与 生成的 `example-atlas.png` 一起走图集路径，自动恢复 2×1 网格。

有来源时序时显示“来源时序”；单独 PNG 或全清单没有时序时使用明确标识的默认 12 fps 测试时序，不宣称为原动画速度。该结构中重复画面使用不同帧文件记录；下方卡片按像素去重，但原始引用和各自时长仍保留。

### 格式 B：植物敌人动作配置 1.0.0

必填格式标识：

```json
{"format":"botanical-enemies-animation-manifest","schemaVersion":"1.0.0"}
```

这是针对上传项目结构的适配器，不是通用引擎标准。必填结构如下：

- `assets`：按角色 ID 索引的对象，1–20 个角色，全包最多 200 个来源帧。
- 每角色 `sourceImage`：`path`（安全相对路径）、`width`、`height`、`sha256`。尺寸是正整数，单边最大 8192，面积最大 3200 万像素。
- `sha256` 是实际 PNG 文件**原始字节**的 64 位十六进制 SHA-256，不是解码像素摘要。重命名不影响关联；重新编码或修改图片会改变摘要。文件名不同仍可按摘要绑定；选择多个版本时忽略未匹配版本，有相同来源重复文件则报错。
- `defaultClip`：必须指向该角色存在的动作 ID。
- `frames`：按帧 ID 索引的对象。播放顺序不由对象键顺序决定。
- `clips`：按动作 ID 索引的对象，单角色最多 100 个动作。
- 每动作 `loop`：布尔值；`sequence`：1–200 项，逐项 `{frame, durationMs}`。引用必须存在，允许 A/B/A 重复引用。时长必须是 1–3,600,000 的整数毫秒。

可选显示字段：角色和动作的 `displayName`。ID 最长 300 字符；危险原型键和父目录标记会拒绝。额外的 `status`、`provenance`、事件、转移、碰撞体等内容仅保存在源配置中，不作为可执行逻辑。

几何字段：

- `sourceRect:{x,y,w,h}`：实际原图像素矩形，非负整数起点、正整数大小，不能越界。支持不同帧的不同尺寸和不规则位置。
- `sourcePivotPx:{x,y}`：参考点相对裁切矩形左上角的像素位置，可为小数或位于矩形外，绝对值最大 8192。提供时按该参考点对齐；合成预览画布仍受单边 8192、面积 3200 万像素限制。
- `sourceRect:null`：缺失，不是 0，也不是规则网格。必须同时有 `sourceLayoutHint:{row,column}` 才可尝试透明像素测量预览。行列值必须是 0–199 的整数；用于测量的行号和每行列号须从 0 连续编号，不可跳号。行列提示只用于识别实测主体的顺序，不用于计算等分矩形。
- `sourcePivotPx:null` 或缺省：没有可信参考点；仅做明确标识的底部居中预览，不推断或写回来源参考点。
- `targetLayout` 永远不用于切当前参考图稿。没有实现旋转打包还原、游戏位移、命中检测或事件执行。

当前适配器将这类项目配置标为“JSON 建议时序”；上传配置本身也注明 `proposed_not_playtested`。播放严格使用声明的毫秒值，但这不意味着已验证游戏手感。帧区间为 `[开始,结束)`；循环动作回绕，非循环动作在最后一帧完整时长结束后停留末帧，不自动执行 `onComplete` 转移。

完整最小示例位于 [custom-animation.json](../examples/json-import/custom-animation.json)。与同目录 `example-atlas.png` 同批导入，或先导入图集再点“导入 JSON”，应得到 A/B/A 三个引用、两个不同画面、0.280 秒。可直接使用的最小结构如下，SHA-256 对应生成脚本输出的 example-atlas.png 原始文件：

```json
{
  "format": "botanical-enemies-animation-manifest",
  "schemaVersion": "1.0.0",
  "assets": {
    "example": {
      "sourceImage": {
        "path": "example-atlas.png",
        "width": 6,
        "height": 4,
        "sha256": "d69ecbcc903e6f1fc225ac2baed3d99ac5c197f1349659ad40e8d8a15edc66f3"
      },
      "defaultClip": "idle",
      "frames": {
        "A": {"sourceRect":{"x":0,"y":0,"w":3,"h":4},"sourcePivotPx":{"x":1.5,"y":4}},
        "B": {"sourceRect":{"x":3,"y":0,"w":3,"h":4},"sourcePivotPx":{"x":1.5,"y":4}}
      },
      "clips": {
        "idle": {"loop":true,"sequence":[
          {"frame":"A","durationMs":80},
          {"frame":"B","durationMs":120},
          {"frame":"A","durationMs":80}
        ]}
      }
    }
  }
}
```

### 错误与恢复

JSON 语法错误、版本不支持、缺帧、时长冲突、摘要不匹配、矩形越界、对齐画布过大或无法可靠测量都会给出错误。自定义配置先完成解码、测量与缩略图暂存，再替换工作区，因此验证或缩略图失败不会清空已有内容；切换到不明确的动作也保留旧预览。源配置缺少坐标或参考点时，不能通过设置理想网格来冒充已经标定。

示例文件由 `tests/json-format-examples.cjs` 直接验证，格式和示例须与解析器测试一起更新。

## 本次上传素材的已知状态


也可先导入 PNG / 图集，再点击素材栏的独立“导入 JSON”按钮关联配置。也支持同时选择 `animation.json` 和包内 PNG，导入 `botanical-enemies-animation-manifest` 1.0.0。来源图片按 JSON 的 SHA-256 匹配，不依赖 ZIP 中被改过的文件名；混合选择新旧版本时，只绑定匹配的来源版本。通过角色、动作下拉框切换预览，严格保留该动作 `sequence` 的引用顺序、重复引用和 `durationMs`，`loop:false` 在末帧完整结束后停止。角色、动作、原图与时序沿用工作区缓存恢复。

这是动画素材预览，不是游戏控制器；事件、命中框、弹丸和动作转移脚本均不会执行。该上传配置的时长标为未实测建议，界面不会将其标成已经验证的游戏时序。

如已有 `sourceRect` 与 `sourcePivotPx`，读取实际像素矩形与参考点；如矩形为 null，绝不使用 `targetLayout` 冒充真实切图坐标。对缺失矩形但主体可分离的参考图，仅按实际强 alpha 连通域测量带少量边距的预览矩形，依照行列提示关联帧，并明确标识“测量预览”。无参考点时临时底部居中，不写回或伪造来源锚点。主体数量不符或接触无法分离时拒绝该动作，保留当前预览并要求标定 `sourceRect`。

上传示例实测：猎犬和司祭全部动作、园丁除死亡外的动作可以测量预览；园丁死亡行两帧接触，6 帧只得到5个主体，不能声称已可靠还原。需要提供这一行的实际矩形才能完整预览该动作。这个限制不会阻止其他19个动作的加载。
