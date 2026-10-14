# 小桃角色贴图 v0.3.2

- 工具：内置 image_gen.imagegen，透明背景；没有使用 CLI 或外部素材。
- 保存文件：assets/host-xiaotao-atlas.png（1882×836 RGBA）。
- 参考：assets/studio.png 与 assets/studio-unboxing.png 中的原版小桃。
- 用途：头部/躯干、左臂、右臂的独立贴图，通过 SVG viewport 选取并在肩部旋转。保留原始 alpha，不重新抠图。
- 集成：src/live-scene.mjs。人物保留细腻脸部、发丝、棉质卫衣和围裙，配合呼吸、接袋、撕袋、卡牌与纸屑效果。
- 检查：PNG 实际透明通道、三种横屏尺寸、双臂动作与订单流程。

## 原始角色素材提示词

```text
Use case: stylized-concept
Asset type: one production character puppet texture atlas for a 2.5D animated game host, with three separated parts on genuine transparent background.
Reference image 1 (studio.png): the woman's face, hairstyle, clothing, rendering quality and warm lighting are the exact design reference. Reference image 2 (studio-unboxing.png): same woman working at the unboxing counter.
Primary request: bring back this beautiful polished stylized 3D young adult female presenter. Soft natural facial anatomy, expressive brown eyes, delicate lips and nose, short layered dark chestnut bob with wispy bangs, rich individual hair strands, warm orange cotton hoodie and cream linen apron with brass buttons and a tiny rabbit pin. Keep the same identity as the reference. Fine soft cinematic 3D shading, realistic cloth folds, subtle skin translucency. NOT a flat vector illustration or simple cartoon.
Composition: a wide single atlas with THREE equally wide vertical columns separated by generous transparent gutters. No labels, no borders, no drawn grid.
LEFT COLUMN: complete head, neck and torso from crown to waist, front-facing with a very slight head tilt, gentle smile looking down towards her work. Include the hoodie shoulders but NO arms or hands on this base torso. Arms will be composited separately in the game. All hair and the full waist are inside the image with margins.
MIDDLE COLUMN: only the matching arm belonging to the LEFT side of the displayed character. Entire orange-sleeved bent arm from shoulder through elbow and forearm, ending in a detailed natural hand, pinching an imaginary pouch edge. It forms a bent L: shoulder at upper left, elbow lower left, forearm reaching inward to the right, fingertips at far right. Arm only, no torso or duplicate head. Rounded sleeve cap is complete, to overlap the torso shoulder. Palm angled slightly toward camera, fingers curl delicately in a pinch.
RIGHT COLUMN: matching arm belonging to the RIGHT side of the displayed character, mirrored pose. Shoulder upper right, elbow lower right, forearm inward to the left, pinching fingers at far left. Complete rounded sleeve cap.
Body column fills most of its height; two arm columns have identical scale to the body, aligned around the middle/lower part of the canvas with room around them. These are separate rigging pieces, never touching one another. Arms have correct elegant adult human proportions and five fingers. Matching light from upper left across all pieces.
Background: actual transparent alpha, not a checkerboard. No table, no bag, no toy, no text, no watermark, no background, no detached extra fingers. Preserve the reference's appealing character quality above all.
```


## v0.3.2 比例与姿势修正

采用同次内置 imagegen 生成的弯臂修订素材，保留人物主体。身体从约 0.51 缩为 0.46，双臂由 0.30 放大为 0.42，保持各自等比。肩部锚点为 (166,246) 与 (374,246)。运行时使用 SVG viewport 选取三个区域，不修改贴图像素。

修订提示词：

```text
Use case: precise-object-edit
Edit target: this transparent character puppet atlas. Keep the LEFT character head and torso EXACTLY unchanged, same beautiful face, hair, clothing, silhouette, scale, placement and lighting. Preserve genuine transparency. Modify ONLY the two detached arms: make both much more compact bent-arm poses, with the forearms angling steeply upward and inward, bringing each pinching hand close to its own shoulder horizontally. The current very long horizontally extended forearms are wrong for the rig. Each arm's opaque bounding box must be approximately 300 pixels wide and 395 pixels tall on this same 1881x836 canvas (current arms are about550 wide). Left-side arm stays in middle column: shoulder near(750,370), elbow near(720,710), pinching fingertips near(960,550). Right-side arm stays in right column: shoulder near(1750,370), elbow near(1780,710), pinching fingertips near(1540,550). Upper arms and forearms look anatomically natural, simply bend the elbows more acutely rather than stretching or shrinking body parts. Matching orange hoodie sleeves rolled at wrist, delicate detailed hands. Preserve soft 3D texture lighting rendering. No new objects, no text, no bag, no table, no background. Do not change the base body at all.
```
