# 小桃角色贴图 v0.3.1

- 工具：内置 image_gen.imagegen，透明背景；没有使用 CLI 或外部素材。
- 保存文件：assets/host-xiaotao-atlas.png（1881×836 RGBA）。
- 参考：assets/studio.png 与 assets/studio-unboxing.png 中的原版小桃。
- 用途：头部/躯干、左臂、右臂的独立贴图，通过 SVG viewport 选取并在肩部旋转。保留原始 alpha，不重新抠图。
- 集成：src/live-scene.mjs。人物保留细腻脸部、发丝、棉质卫衣和围裙，配合呼吸、接袋、撕袋、卡牌与纸屑效果。
- 检查：PNG 实际透明通道、三种横屏尺寸、双臂动作与订单流程。

## 最终采用素材的提示词

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
