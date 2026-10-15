# 三国群英 · 第一版美术规范

## 交付与使用

- 魏：玄武雄图，玄蓝 / 银，玄武与北境城阙。
- 蜀：青龙义誓，翠绿 / 古金，青龙与蜀道云山。
- 吴：赤虎江潮，朱红 / 铜，赤虎与长江战帆。
- `pack-wei.png`、`pack-shu.png`、`pack-wu.png` 是三张独立包装画，不是同图换色。
- `back-wei.png`、`back-shu.png`、`back-wu.png` 是三张独立阵营卡背画。每位武将在 SVG 层有独立卡名、编号，45 张卡均可查看正反面。
- 45 张武将立绘由人物美术组独立生成，位于 `portraits/<faction>-<slug>.png`。本文件描述包装 / 卡背，不代替人物组生成记录。
- 武将采用真实人体比例的国风历史幻想收藏卡风格。武器、徽记、称号是艺术化设计，并非文物复原或史实考据。
- 卡面文字、品质、编号由 `src/art.mjs` 生成，避免把生成图中的字误作数据。
- 正反卡面标准画布为 160 × 224，包装为同画布带侧面和封边。三款包装同时用于商品列表与桌面队列。
- `runtime/` 为原画的游戏纹理导出，宽 540px、保持比例、WebP quality 0.9；不改人物、构图或配色。原始 PNG 保留，实际界面及发布包引用 WebP，发布包不重复装入原画。使用 `pnpm build:textures` 可重现导出。

## 名单与概率

每阵营 15 张，6 普通、5 稀有、3 史诗、1 传说；品质总概率依次 60%、28%、10%、2%。同品质均分，单卡分别 10%、5.6%、10/3%、2%。单卡概率由 `itemProbability` 统一计算，UI 可四舍五入显示。

魏传说曹操，史诗夏侯惇 / 张辽 / 典韦；蜀传说关羽，史诗赵云 / 张飞 / 马超；吴传说周瑜，史诗孙策 / 陆逊 / 太史慈。完整名单、原创称号与文案以 `src/game.mjs` 为准。

价格及品质折现值沿用旧三包数值。旧街角 / 森野 / 星际藏品保留原 ID、价值、画法与存档读取能力，不改动已支付结果。

## 生成方式与提示词

包装及卡背均使用内置 `image_gen` 工具生成，无 CLI / API 密钥调用。原始生成图保留在 Codex generated_images 目录，选用成品已复制到当前目录。

包装公共提示词（分别替换 faction / description，三次独立生成）：

> Use case: stylized-concept. Create ONE production game collectible Three Kingdoms card PACK FRONT illustration. Full-bleed tall portrait 5:7 flat rectangular artwork, no perspective or mockup, no surround. Premium historical Chinese collector card pack design: DESCRIPTION. Exquisite painted detail, embossed metallic filigree around edges, powerful central animal emblem, layered traditional cloud ornament. Reserve quiet dark area in top 18% and bottom 15% for runtime typography. No humans, no text, no letters, no watermarks. This is the FACTION faction's unique original packaging artwork.

包装 description：

- wei: midnight navy-blue and silver, a mighty Xuanwu tortoise entwined by a serpent, northern fortress silhouette, restrained cold light
- shu: deep jade green and aged gold, a coiling azure Chinese dragon, misty mountain passes and ancient banners, heroic warm light
- wu: vermilion red and antique copper, a fierce red tiger over curling river waves, distant warship sails, sunset light

卡背公共提示词（分别替换 faction / description，独立生成；蜀首次未返回成功产物后按同一设计补生成）：

> Use case: stylized-concept. ONE flat rectangular collectible card BACK texture, full-bleed portrait 5:7 aspect. Premium original Chinese Three Kingdoms game deck FACTION faction. DESCRIPTION. Central circular intricate animal seal surrounded by elaborate symmetrical metallic line engravings. Dark luxurious lacquer-paper surface, sharp fine details, tactile foil rim, restrained cinematic glow. Clearly a card reverse emblem pattern, NOT a human character portrait, NOT a package mockup, no scene surround. Reserve darker strips top and bottom for code typography. No text, no writing, no letters, no watermark.

卡背 description：

- wei: midnight navy and silver Xuanwu tortoise entwined by serpent, northern celestial star map, ancient bronze meander ornament
- shu: jade green and aged gold coiling Chinese dragon, bamboo and mountain cloud curls, bronze ritual ornament（补生成中将 central animal seal 明确为 dragon seal）
- wu: vermilion and copper roaring tiger, concentric flowing river waves and ancient warship sail symbols, luminous ember ornament

## 美术自检

已逐张查看六张包装 / 卡背图片：无文字水印；阵营、主色及纹章可区分；包装为具象场景画，卡背为中轴纹章图案；未将包装与卡背混用。主体居中，保留文字留白。
