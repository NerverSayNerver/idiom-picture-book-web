/**
 * 批量创建各品类预生成绘本数据（占位版，含完整场景结构，无图片）
 * 用于书架展示和阅读页测试
 */
const fs = require('fs')
const path = require('path')

const BASE = path.join(__dirname, '..', 'public', 'generated')

// ── 各品类绘本数据 ──────────────────────────────────────

const BOOKS = {
  poetry: [
    {
      sourceText: '静夜思', author: '李白', dynasty: '唐',
      meaning: '诗人在安静的夜晚思念家乡，看着月光洒在地上，以为是秋霜，引发了对故乡的深深思念。',
      scenes: [
        { title: '窗前月光', narration: '夜晚，月光悄悄地照进窗户，洒在李白的床前。', prompt: 'A gentle moonlit night, soft silver moonlight streaming through a wooden window into a simple ancient Chinese room, illuminating the floor, classical Chinese ink painting style with soft pastel colors, children book illustration, warm atmosphere, detailed texture.' },
        { title: '疑是秋霜', narration: '白白的一片，李白揉揉眼睛，以为地上落了一层秋霜呢。', prompt: 'Close-up of a young Chinese poet in white robes kneeling by the window, looking down at the bright moonlight on the floor with a surprised expression, classical Chinese ink painting style, soft pastel colors, children book illustration.' },
        { title: '抬头望月', narration: '他抬头看看天上的月亮，又圆又亮，和家里看到的一模一样。', prompt: 'A young Chinese poet in white robes standing by an open window, looking up at a large full moon in a dark blue sky, stars twinkling, classical Chinese ink painting style, soft pastel colors, children book illustration, peaceful mood.' },
        { title: '低头思乡', narration: '李白低下头，想起了远方的家，想起了家里的亲人，眼泪忍不住流了下来。', prompt: 'A young Chinese poet sitting by the window with head bowed, a single tear on his cheek, moonlight casting a soft glow, nostalgic mood, classical Chinese ink painting style, soft pastel colors, children book illustration, emotional scene.' },
      ],
    },
    {
      sourceText: '春晓', author: '孟浩然', dynasty: '唐',
      meaning: '春天的早晨，鸟儿在枝头歌唱，风雨过后，花儿落了多少呢？表达了对春天美景的喜爱和珍惜。',
      scenes: [
        { title: '春眠不觉晓', narration: '春天的早上，暖洋洋的阳光照进来，孟浩然睡得好香好香，都不想起来。', prompt: 'A cozy bedroom in ancient China, warm morning sunlight streaming through a window, a man sleeping peacefully under a light blanket, spring flowers visible outside, soft watercolor illustration, pastel colors, children book.' },
        { title: '处处闻啼鸟', narration: '窗外传来小鸟叽叽喳喳的歌声，好热闹呀！', prompt: 'View from inside looking out a window, colorful birds singing on blooming branches, morning light, cherry blossoms, cheerful atmosphere, soft watercolor illustration, pastel colors, children book, detailed feathers.' },
        { title: '夜来风雨声', narration: '昨天夜里下了一场春雨，呼呼的风声伴着他入睡。', prompt: 'Night scene with gentle rain falling on spring flowers and trees, wind blowing softly, moon partially hidden by clouds, soft watercolor illustration, muted pastel colors, children book, dreamy atmosphere.' },
        { title: '花落知多少', narration: '地上落了好多花瓣，不知道昨天开了多少花呢？', prompt: 'Morning garden scene with colorful flower petals scattered on the ground after rain, a few remaining blossoms on trees, puddles reflecting sky, soft watercolor illustration, pastel colors, children book, bittersweet beauty.' },
      ],
    },
    {
      sourceText: '咏鹅', author: '骆宾王', dynasty: '唐',
      meaning: '七岁的小诗人骆宾王看到池塘里的白鹅，用生动的语言描写了鹅的美丽姿态。',
      scenes: [
        { title: '鹅鹅鹅', narration: '池塘里有三只大白鹅，它们正在水里快乐地游来游去。', prompt: 'A beautiful pond in a Chinese garden, three white geese swimming gracefully on clear water, green lotus leaves floating, bright sunny day, soft watercolor illustration, pastel colors, children book illustration.' },
        { title: '曲项向天歌', narration: '白鹅弯着长长的脖子，对着天空唱起了歌，嘎嘎嘎！', prompt: 'Close-up of a white goose with its neck curved upward, beak open as if singing, blue sky background, cherry blossoms nearby, soft watercolor illustration, pastel colors, children book illustration, joyful mood.' },
        { title: '白毛浮绿水', narration: '雪白的羽毛浮在碧绿的水面上，真好看呀！', prompt: 'Overhead view of white geese floating on emerald green water, their white feathers contrasting with green water surface, lily pads around, soft watercolor illustration, pastel colors, children book illustration.' },
        { title: '红掌拨清波', narration: '红红的脚掌在水里轻轻划动，荡起一圈圈小波纹。', prompt: 'Underwater view showing orange-red webbed feet of a goose paddling in clear water, bubbles and ripples, soft watercolor illustration, pastel colors, children book illustration, playful perspective.' },
      ],
    },
    {
      sourceText: '悯农', author: '李绅', dynasty: '唐',
      meaning: '农民伯伯在烈日下辛苦种地，每一粒粮食都来之不易，我们要珍惜食物。',
      scenes: [
        { title: '锄禾日当午', narration: '大中午的太阳火辣辣地照着大地，农民伯伯还在田里锄草。', prompt: 'A farmer working in a rice field under blazing noon sun, wearing a conical straw hat, wiping sweat, golden sunlight, green rice plants, soft watercolor illustration, warm pastel colors, children book.' },
        { title: '汗滴禾下土', narration: '豆大的汗珠从农民伯伯的脸上掉下来，滴到泥土里。', prompt: 'Close-up of a farmer with sweat drops falling from his face onto the dark soil below, intense sunlight overhead, determined expression, soft watercolor illustration, warm pastel colors, children book.' },
        { title: '谁知盘中餐', narration: '小朋友端起碗，碗里的米饭白白的、香香的。', prompt: 'A child sitting at a wooden table in a traditional Chinese home, holding a bowl of fluffy white rice, looking at it thoughtfully, warm indoor lighting, soft watercolor illustration, pastel colors, children book.' },
        { title: '粒粒皆辛苦', narration: '每一粒米饭都是农民伯伯用汗水换来的呀，我们可不能浪费！', prompt: 'Split scene: left side shows farmer working hard in sun, right side shows child eating rice happily, connected by floating rice grains, soft watercolor illustration, pastel colors, children book, educational theme.' },
      ],
    },
    {
      sourceText: '登鹳雀楼', author: '王之涣', dynasty: '唐',
      meaning: '诗人登上高楼远望，看到了壮丽的山河景色，明白了只有站得高才能看得远的道理。',
      scenes: [
        { title: '白日依山尽', narration: '太阳慢慢落到了山的那边，把天空染成了金色和红色。', prompt: 'A magnificent sunset over a mountain range, the golden sun slowly setting behind green mountains, sky painted in orange and gold, a tall ancient Chinese tower in foreground, soft watercolor illustration, pastel colors, children book.' },
        { title: '黄河入海流', narration: '黄河的水弯弯曲曲，一直流到了大海里。', prompt: 'Aerial view of a winding yellow river flowing through green landscape toward the distant sea, golden afternoon light, birds flying, soft watercolor illustration, pastel colors, children book, panoramic view.' },
        { title: '欲穷千里目', narration: '王之涣想看到更远的地方，于是他一步一步爬上了更高的楼。', prompt: 'A poet in traditional robes climbing the stairs of a tall ancient Chinese tower, determined expression, looking upward, clouds around, soft watercolor illustration, pastel colors, children book.' },
        { title: '更上一层楼', narration: '站得越高，看得越远！我们也一样，要不断努力向上！', prompt: 'A poet standing at the top of a tall tower, looking out over vast landscape of mountains and rivers, wind blowing robes, triumphant pose, soft watercolor illustration, pastel colors, children book, inspiring scene.' },
      ],
    },
  ],
  'nursery-rhyme': [
    {
      sourceText: '小兔子乖乖',
      meaning: '小兔子一个人在家，大灰狼来敲门，小兔子很聪明，没有给大灰狼开门。',
      scenes: [
        { title: '小兔子在家', narration: '小兔子一个人在家玩积木，兔妈妈出门买东西去了。', prompt: 'A cute little white rabbit playing with colorful blocks inside a cozy bunny house, warm sunlight through window, toys scattered around, soft watercolor illustration, pastel colors, children book.' },
        { title: '大灰狼来了', narration: '咚咚咚！有人敲门。大灰狼在外面喊："小兔子乖乖，把门儿开开！"', prompt: 'A big gray wolf standing outside a small wooden door with a sinister smile, knocking on the door, cute little rabbit peeping through window nervously, soft watercolor illustration, pastel colors, children book.' },
        { title: '不开不开', narration: '小兔子摇摇头说："不开不开，我不开！妈妈没回来，谁来也不开！"', prompt: 'A cute little white rabbit shaking its head firmly behind a closed door, holding the door handle, determined expression, the wolf visible outside, soft watercolor illustration, pastel colors, children book.' },
        { title: '妈妈回来了', narration: '兔妈妈回来了，小兔子高兴地扑进妈妈怀里，妈妈夸它真聪明！', prompt: 'A mother rabbit hugging her little white rabbit at the doorway, both smiling happily, the gray wolf running away in the background, warm sunset light, soft watercolor illustration, pastel colors, children book.' },
      ],
    },
    {
      sourceText: '两只老虎',
      meaning: '两只可爱的老虎跑得很快，一只没有耳朵，一只没有尾巴，真是太奇怪了！',
      scenes: [
        { title: '老虎出门', narration: '两只小老虎今天心情特别好，它们决定一起出去玩。', prompt: 'Two cute cartoon tigers walking out of a cave into a sunny forest, both smiling, green trees and flowers around, soft watercolor illustration, pastel colors, children book.' },
        { title: '跑得快', narration: '两只老虎跑呀跑，跑得飞快，风吹得耳朵都竖起来了！', prompt: 'Two cute cartoon tigers running fast through a green meadow, wind blowing their fur, dynamic motion, flowers swaying, soft watercolor illustration, pastel colors, children book.' },
        { title: '真奇怪', narration: '咦？一只老虎没有耳朵，另一只老虎没有尾巴，好奇怪呀！', prompt: 'Two cartoon tigers side by side, one without ears looking puzzled, another without a tail looking confused, question marks above their heads, soft watercolor illustration, pastel colors, children book, funny scene.' },
        { title: '一起唱歌', narration: '虽然它们都有一点不一样，但它们是最好最好的朋友！', prompt: 'Two cartoon tigers sitting together under a tree, singing with musical notes floating around, sunset background, friendship theme, soft watercolor illustration, pastel colors, children book.' },
      ],
    },
    {
      sourceText: '小星星',
      meaning: '满天的星星一闪一闪，像好多小眼睛在天空中眨呀眨，真漂亮！',
      scenes: [
        { title: '天黑了', narration: '太阳下山了，天空变成了深蓝色，星星开始一颗一颗地亮起来了。', prompt: 'Beautiful twilight sky transitioning from orange to deep blue, first stars appearing, a child looking up from a hilltop, silhouettes of trees, soft watercolor illustration, pastel colors, children book.' },
        { title: '一闪一闪', narration: '满天的小星星一闪一闪亮晶晶，像撒在天上的小钻石。', prompt: 'A vast night sky filled with twinkling golden stars of different sizes, some stars winking, deep blue to purple gradient sky, magical sparkle effect, soft watercolor illustration, pastel colors, children book.' },
        { title: '满天都是', narration: '小星星多得数也数不清，它们在天上排成了各种形状。', prompt: 'Night sky with stars forming fun shapes like a teddy bear, a heart, and a house, connected by faint dotted lines, a child pointing excitedly, soft watercolor illustration, pastel colors, children book.' },
        { title: '晚安星星', narration: '小朋友对着星星说了声晚安，然后闭上眼睛，甜甜地睡着了。', prompt: 'A child in pajamas waving goodnight from a bedroom window, stars twinkling outside, warm lamp light inside, cozy bedtime scene, soft watercolor illustration, pastel colors, children book.' },
      ],
    },
  ],
  proverb: [
    {
      sourceText: '三个臭皮匠，顶个诸葛亮',
      meaning: '三个普通人在一起想办法，智慧加在一起，也能和聪明人一样厉害。团结就是力量！',
      scenes: [
        { title: '难题来了', narration: '村里遇到了一个大难题，大家都想不出办法，愁眉苦脸的。', prompt: 'A group of worried villagers in ancient China standing around a big question mark drawn in sand, worried expressions, village in background, soft watercolor illustration, pastel colors, children book.' },
        { title: '三个人商量', narration: '三个皮匠师傅坐在一起，你一言我一语地商量起来。', prompt: 'Three friendly leather workers sitting around a wooden table, each holding a different tool, discussing animatedly with speech bubbles, workshop setting, soft watercolor illustration, pastel colors, children book.' },
        { title: '好主意！', narration: '突然，一个人拍了拍脑袋说："我有办法了！"大家一起想出了一个好主意！', prompt: 'One of the three workers with a bright light bulb above his head, excited expression, the other two looking amazed and happy, soft watercolor illustration, pastel colors, children book, eureka moment.' },
        { title: '问题解决了', narration: '大家一起努力，难题被解决了！三个普通人团结在一起，真了不起！', prompt: 'The three workers and villagers celebrating together in the village square, cheering and smiling, confetti and fireworks, the problem visibly solved in background, soft watercolor illustration, pastel colors, children book.' },
      ],
    },
    {
      sourceText: '千里送鹅毛，礼轻情意重',
      meaning: '虽然礼物很轻很便宜，但是从很远的地方送来的，代表的情意是非常珍贵的。',
      scenes: [
        { title: '远方的朋友', narration: '小明住在一个很远的地方，他的好朋友小红要过生日了。', prompt: 'A young boy in ancient Chinese clothing looking at a photo of his friend, mountains and long road visible through window, thoughtful expression, soft watercolor illustration, pastel colors, children book.' },
        { title: '带着礼物出发', narration: '小明带着一根漂亮的鹅毛，走了很远很远的路去看小红。', prompt: 'A boy walking along a winding path through mountains, carrying a single beautiful white goose feather wrapped in red cloth, determination on his face, scenic landscape, soft watercolor illustration, pastel colors, children book.' },
        { title: '到达目的地', narration: '小明终于到了，衣服都走破了，但他小心翼翼地拿出鹅毛送给小红。', prompt: 'A tired but happy boy presenting a single white goose feather to a surprised girl, both smiling, simple birthday setting, emotional moment, soft watercolor illustration, pastel colors, children book.' },
        { title: '情意最珍贵', narration: '小红感动得哭了，虽然只是一根鹅毛，但这份情谊比什么都珍贵！', prompt: 'The girl hugging the boy, tears of joy, the white goose feather displayed on a shelf like treasure, hearts floating around, warm light, soft watercolor illustration, pastel colors, children book, heartwarming scene.' },
      ],
    },
    {
      sourceText: '近朱者赤，近墨者黑',
      meaning: '接近好人会变好，接近坏人会变坏。交朋友要选择好的榜样。',
      scenes: [
        { title: '小红和小明', narration: '小红是个爱学习的好孩子，小明是个爱偷懒的淘气包。', prompt: 'Two boys in a schoolyard, one reading a book diligently with neat appearance, another playing and messy with mischievous grin, contrast between them, soft watercolor illustration, pastel colors, children book.' },
        { title: '一起玩', narration: '小明和小红成了好朋友，他们每天都在一起玩。', prompt: 'The two boys playing together in a park, one reading to the other, both smiling, flowers and butterflies around, friendship scene, soft watercolor illustration, pastel colors, children book.' },
        { title: '慢慢变化', narration: '慢慢地，小明也变得爱学习了，因为小红总是认真地看书。', prompt: 'The previously messy boy now sitting at a desk studying with a book, looking focused and neat, transformation visible, classroom setting, soft watercolor illustration, pastel colors, children book.' },
        { title: '变成好朋友', narration: '小明的成绩越来越好了，他们都成了班里的好学生！好朋友互相帮助真好！', prompt: 'Both boys studying together happily, getting gold stars on their papers, teacher smiling in background, classroom scene, achievement celebration, soft watercolor illustration, pastel colors, children book.' },
      ],
    },
  ],
  'fairy-tale': [
    {
      sourceText: '三只小猪',
      meaning: '做事要认真踏实，不能偷懒。只有付出努力，才能建造出经得起考验的房子。',
      scenes: [
        { title: '三兄弟出发', narration: '三只小猪长大了，要离开妈妈，去外面建自己的房子。', prompt: 'Three cute little pigs with backpacks waving goodbye to their mother pig at a doorway, green countryside road ahead, sunny day, soft watercolor illustration, pastel colors, children book.' },
        { title: '草房子', narration: '大哥很懒，用稻草随便搭了一间房子，很快就盖好了。', prompt: 'The eldest pig happily building a house with straw, looking lazy and quick, simple structure barely standing, other pigs watching, soft watercolor illustration, pastel colors, children book.' },
        { title: '木房子', narration: '二哥也不太认真，用木头搭了一间房子，比草房子好一点。', prompt: 'The middle pig building a house with wooden planks, looking somewhat pleased, a sturdier but still simple house, tools scattered around, soft watercolor illustration, pastel colors, children book.' },
        { title: '砖房子', narration: '小弟最认真，一块一块地砌砖头，盖了一间又结实又漂亮的大房子。', prompt: 'The youngest pig carefully laying bricks one by one, sweating but determined, a beautiful sturdy brick house taking shape, other pigs watching from their weaker houses, soft watercolor illustration, pastel colors, children book.' },
        { title: '大灰狼来了', narration: '大灰狼来了！它轻轻一吹，草房子就倒了！木房子也倒了！', prompt: 'A big gray wolf blowing hard at the straw house which is falling apart, straw flying everywhere, the first pig running to the brick house in panic, dramatic scene, soft watercolor illustration, pastel colors, children book.' },
        { title: '砖房安全', narration: '大灰狼使劲吹砖房子，可是怎么也吹不倒！三只小猪在砖房里安全了！', prompt: 'The wolf blowing furiously at the sturdy brick house which stands firm, three pigs peeking from a window safely inside, wolf tired and frustrated, soft watercolor illustration, pastel colors, children book.' },
        { title: '胜利庆祝', narration: '从此以后，三只小猪住在坚固的砖房里，快乐地生活在一起。', prompt: 'Three happy pigs dancing and celebrating inside their sturdy brick house, wolf running away in the distance, warm interior with furniture, soft watercolor illustration, pastel colors, children book, happy ending.' },
      ],
    },
    {
      sourceText: '小红帽',
      meaning: '要听爸爸妈妈的话，不要和陌生人说话，遇到危险要保持冷静和勇敢。',
      scenes: [
        { title: '去看外婆', narration: '小红帽带上蛋糕和水果，要去住在森林里的外婆家。', prompt: 'A cute little girl wearing a red hood carrying a basket with cake and fruits, standing at the edge of a forest path, mother waving from a cottage door, sunny morning, soft watercolor illustration, pastel colors, children book.' },
        { title: '森林里', narration: '小红帽蹦蹦跳跳地走进了森林，路边有美丽的花朵和蝴蝶。', prompt: 'A little girl in red hood walking happily through a beautiful forest, colorful flowers and butterflies everywhere, dappled sunlight through trees, soft watercolor illustration, pastel colors, children book.' },
        { title: '遇到大灰狼', narration: '大灰狼出现了，假装好心地问小红帽要去哪里。', prompt: 'A sly-looking wolf in disguise talking to the innocent little girl in the forest, wolf leaning against a tree casually, the girl chatting happily, soft watercolor illustration, pastel colors, children book.' },
        { title: '狼先到了', narration: '大灰狼飞快地跑到外婆家，把外婆藏了起来，自己装成外婆躺在床上。', prompt: 'The wolf running fast toward a small cottage in the woods, the old grandmother being hidden in a closet, dramatic scene, soft watercolor illustration, pastel colors, children book.' },
        { title: '门开了', narration: '小红帽到了外婆家，觉得外婆今天看起来好奇怪呀...', prompt: 'The little girl opening the cottage door, seeing the wolf dressed as grandmother in bed, suspicious look on her face, cozy cottage interior, soft watercolor illustration, pastel colors, children book.' },
        { title: '勇敢得救', narration: '猎人叔叔听到了声音赶来，救出了小红帽和外婆，大灰狼被赶跑了！', prompt: 'A brave hunter arriving at the cottage, the wolf running away scared, the girl and grandmother hugging happily, relief and joy, soft watercolor illustration, pastel colors, children book, rescue scene.' },
      ],
    },
    {
      sourceText: '龟兔赛跑',
      meaning: '做事情不能骄傲自大，坚持到底的人才能获得最终的胜利。',
      scenes: [
        { title: '骄傲的兔子', narration: '兔子嘲笑乌龟走路太慢，乌龟不服气，要和兔子比赛跑步！', prompt: 'A proud white rabbit laughing at a small green turtle on a forest path, other animals watching, the turtle looking determined, competitive atmosphere, soft watercolor illustration, pastel colors, children book.' },
        { title: '比赛开始', narration: '随着一声哨响，兔子飞快地跑远了，乌龟慢吞吞地往前爬。', prompt: 'A rabbit zooming away in a dust cloud while a small turtle slowly starts walking, a start line with a flag, forest track, dynamic motion contrast, soft watercolor illustration, pastel colors, children book.' },
        { title: '兔子睡觉', narration: '兔子跑了一半，回头看看乌龟还在很远的地方。它打了个哈欠，在树下睡着了。', prompt: 'A rabbit yawning and falling asleep under a shady tree, the turtle slowly passing by in the background, peaceful forest setting, soft watercolor illustration, pastel colors, children book.' },
        { title: '乌龟坚持', narration: '太阳快下山了，乌龟还在一步一步地往前爬，从来没有停下来。', prompt: 'A determined turtle walking step by step along a forest path, sunset in background, sweat drops showing effort, focused expression, inspiring mood, soft watercolor illustration, pastel colors, children book.' },
        { title: '乌龟赢了', narration: '乌龟到达了终点！兔子醒来的时候，乌龟已经赢了！坚持就是胜利！', prompt: 'The turtle crossing the finish line with a flag, the rabbit running up behind looking shocked, all forest animals cheering, celebration scene, soft watercolor illustration, pastel colors, children book, triumphant moment.' },
      ],
    },
  ],
}

// ── 生成文件 ──────────────────────────────────────────────

let total = 0

for (const [category, books] of Object.entries(BOOKS)) {
  for (const bookData of books) {
    const dir = path.join(BASE, category, bookData.sourceText)
    fs.mkdirSync(dir, { recursive: true })

    const book = {
      id: bookData.sourceText,
      category,
      sourceText: bookData.sourceText,
      title: bookData.sourceText,
      author: bookData.author,
      dynasty: bookData.dynasty,
      meaning: bookData.meaning,
      createdAt: new Date().toISOString(),
      scenes: bookData.scenes.map((s, i) => ({
        id: i + 1,
        title: s.title,
        description: s.prompt.split(',').slice(1).join(',').trim() || s.narration,
        prompt: s.prompt,
        compositionHint: '',
        narration: s.narration,
        // 无图片，阅读页会从 generated/{category}/{sourceText}/{id}.png 构造路径
      })),
    }

    fs.writeFileSync(path.join(dir, 'book.json'), JSON.stringify(book, null, 2))
    total++
    console.log(`  ✓ ${category}/${bookData.sourceText} (${bookData.scenes.length} 场景)`)
  }
}

// ── 更新 index.json ──────────────────────────────────────

const indexPath = path.join(BASE, 'index.json')
let index = { version: 2, generatedAt: new Date().toISOString(), categories: {} }

if (fs.existsSync(indexPath)) {
  try { index = JSON.parse(fs.readFileSync(indexPath, 'utf-8')) } catch {}
}

const labels = { idiom: '成语', poetry: '古诗', 'nursery-rhyme': '儿歌', proverb: '谚语', 'fairy-tale': '童话' }
const icons = { idiom: '🎭', poetry: '📜', 'nursery-rhyme': '🎵', proverb: '💬', 'fairy-tale': '🏰' }

for (const [category, books] of Object.entries(BOOKS)) {
  if (!index.categories[category]) {
    index.categories[category] = { label: labels[category], icon: icons[category], count: 0, items: [] }
  }
  const cat = index.categories[category]

  for (const bookData of books) {
    const id = bookData.sourceText
    const existing = cat.items.findIndex(i => i.id === id)
    const entry = {
      id,
      sourceText: bookData.sourceText,
      title: bookData.sourceText,
      meaning: bookData.meaning,
      sceneCount: bookData.scenes.length,
      author: bookData.author,
      dynasty: bookData.dynasty,
      createdAt: new Date().toISOString(),
    }
    if (existing >= 0) cat.items[existing] = entry
    else cat.items.push(entry)
  }
  cat.count = cat.items.length
}

index.generatedAt = new Date().toISOString()
fs.writeFileSync(indexPath, JSON.stringify(index, null, 2))

console.log(`\n=== 完成：共创建 ${total} 本绘本，更新 index.json ===`)
