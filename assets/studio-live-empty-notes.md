# 动态直播室空景

- 文件：`assets/studio-live-empty.png`
- 日期：2026-10-14
- 工具：内置 `image_gen.imagegen`，编辑模式，非 CLI。
- 编辑源：`assets/studio-unboxing.png`，保留原图。
- 输出尺寸：2172 × 724，3:1，不透明 PNG。
- 用途：保留货架、潮玩样品和工作台，移除静态主播与右侧摄影支架，为代码叠加的动态主播、撕袋、出卡表演预留空间。
- 检查：无人物或人手；工作台中央与右侧开放；保留薄荷、奶油、橙色暖光 3D 潮玩工作室风格。

## 精确提示词

```text
Use case: precise-object-edit
Asset type: panoramic background for a Windows offline collectible-toy livestream game, with code-rendered animated presenter composited on top later.
Input image 1 is the edit target. Edit this existing scene, preserving the original style, perspective, lighting, palette and approximately 3:1 panoramic composition (original is 2172x724).
Primary request: remove the woman presenter entirely, including all her hair, face, body, clothing and hands, and reconstruct the studio background behind her. Remove the foreground black camera rig at the right edge. No people and no human hands anywhere. Keep the mint cream orange warmly lit polished stylized 3D collectible-toy studio.
Keep unchanged: dense pastel blind-box inventory on left shelves; small plants; central back-row acrylic toy display with its small collectible toys; broad clean pale mint work mat across the bottom; warm wood and cream shelving; background props. Preserve their placement, design, and proportions as closely as possible.
The right half should have a simple layered back wall and shelves in the background, with no large toys or objects occupying the space where the presenter was. The central and right foreground tabletop must be clean and open for an animated presenter and pouch-tearing / card-reveal performance added by code. Upper area is shelving and studio backdrop; lower area is work surface.
Avoid: people, arms, hands, silhouettes, new foreground toys, any UI, lettering, captions, logos, watermark. Change only the requested removals and fill the resulting empty areas naturally.
```
