/**
 * 批量生成20个成语绘本
 *
 * 使用方法：
 * node scripts/batch-generate.js
 *
 * 此脚本会调用 Agnes API 生成20个成语绘本的数据和图像，
 * 图片会立即下载保存到本地，避免临时链接过期。
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const API_KEY = process.env.AGNES_API_KEY;
if (!API_KEY) {
  console.error('错误: 请设置 AGNES_API_KEY 环境变量');
  console.error('使用方法: AGNES_API_KEY=your_key node scripts/batch-generate.js');
  process.exit(1);
}
const API_BASE = 'https://apihub.agnes-ai.com/v1';

// 输出目录
const OUTPUT_DIR = path.join(__dirname, '..', 'public', 'pre-generated');
const IMAGES_DIR = path.join(OUTPUT_DIR, 'images');

// 20个常用成语
const IDIOM_LIST = [
  '画蛇添足', '守株待兔', '亡羊补牢', '井底之蛙', '狐假虎威',
  '掩耳盗铃', '刻舟求剑', '愚公移山', '拔苗助长', '叶公好龙',
  '对牛弹琴', '杯弓蛇影', '破釜沉舟', '卧薪尝胆', '望梅止渴',
  '纸上谈兵', '指鹿为马', '完璧归赵', '负荆请罪', '闻鸡起舞'
];

// 场景模板 - 每个成语带有统一的角色描述和风格前缀，保证画面连贯
const STYLE_PREFIX = 'Chinese children book illustration, cute cartoon style, warm colors, consistent art style, ';

const SCENE_TEMPLATES = {
  '画蛇添足': {
    character: 'a young man in ancient Chinese white robe with a round face',
    scenes: [
      { title: '画蛇比赛', prompt: STYLE_PREFIX + 'a young man in white robe drawing a snake on paper with brush, other competitors around, ancient Chinese courtyard, competition scene', narration: '从前有几个人比赛画蛇，看谁画得快。' },
      { title: '添足之人', prompt: STYLE_PREFIX + 'the same young man in white robe proudly adding feet to his snake drawing, smug expression, others watching in disbelief', narration: '有个人画完了蛇，还给蛇添上了脚。' },
      { title: '比赛失败', prompt: STYLE_PREFIX + 'the young man in white robe looking sad holding his snake-with-feet drawing, others celebrating winner, lesson scene', narration: '结果他反而输了比赛，多此一举反而不好。' }
    ]
  },
  '守株待兔': {
    character: 'a middle-aged farmer in brown clothes and straw hat',
    scenes: [
      { title: '兔子撞树', prompt: STYLE_PREFIX + 'a rabbit running fast and hitting a tree stump, motion lines, farm field background, sunny day', narration: '有一天，一只兔子撞到树桩上死了。' },
      { title: '农夫等待', prompt: STYLE_PREFIX + 'the farmer in brown clothes sitting lazily against the same tree stump, waiting, empty field, bored expression', narration: '农夫从此每天坐在树桩旁等兔子。' },
      { title: '田地荒芜', prompt: STYLE_PREFIX + 'the farmer in brown clothes still sitting by stump, overgrown weeds in field, other farmers working in background, contrast scene', narration: '结果田地都荒芜了，再也没有兔子来。' }
    ]
  },
  '亡羊补牢': {
    character: 'a young shepherd in blue clothes',
    scenes: [
      { title: '羊圈破洞', prompt: STYLE_PREFIX + 'a shepherd in blue clothes discovering a hole in wooden sheep pen fence, wolf eyes glowing in dark night', narration: '羊圈破了个洞，狼趁机偷走了几只羊。' },
      { title: '修补羊圈', prompt: STYLE_PREFIX + 'the shepherd in blue clothes actively repairing the wooden fence with tools, determined expression, daytime', narration: '邻居劝他赶快修补羊圈。' },
      { title: '羊群安全', prompt: STYLE_PREFIX + 'the shepherd in blue clothes smiling with sheep safely inside repaired pen, green pasture, happy scene', narration: '他修好羊圈后，再也没有丢过羊。' }
    ]
  },
  '井底之蛙': {
    character: 'a small green frog with big eyes',
    scenes: [
      { title: '青蛙在井底', prompt: STYLE_PREFIX + 'a small green frog sitting at bottom of a stone well, looking up at tiny circle of sky, limited view, claustrophobic', narration: '有一只青蛙住在井底，觉得天只有井口那么大。' },
      { title: '海龟来访', prompt: STYLE_PREFIX + 'the same green frog at well bottom talking to a friendly sea turtle looking down from well edge, conversation scene', narration: '海龟告诉它大海有多广阔。' },
      { title: '青蛙惊讶', prompt: STYLE_PREFIX + 'the green frog with wide surprised eyes, imagination bubble showing vast ocean, eye-opening moment', narration: '青蛙听了非常惊讶，原来世界这么大！' }
    ]
  },
  '狐假虎威': {
    character: 'an orange fox with sly smile and a large striped tiger',
    scenes: [
      { title: '狐狸骑虎', prompt: STYLE_PREFIX + 'a sly orange fox riding on back of a large striped tiger, forest path, fox looking proud, tiger confused', narration: '狐狸骑在老虎背上，在森林里走。' },
      { title: '动物害怕', prompt: STYLE_PREFIX + 'forest animals rabbit deer bear running away in fear from the tiger with fox on its back, dramatic scene', narration: '其他动物看到都吓得逃跑。' },
      { title: '真相大白', prompt: STYLE_PREFIX + 'the tiger looking angry at the scared orange fox who is trembling, fox exposed, forest background', narration: '老虎发现真相后，狐狸再也不敢骗人了。' }
    ]
  },
  '掩耳盗铃': {
    character: 'a sneaky thief in dark clothes with a round face',
    scenes: [
      { title: '看到铃铛', prompt: STYLE_PREFIX + 'a sneaky man in dark clothes eyeing a beautiful bronze bell hanging from door, greedy expression, night scene', narration: '有个人想偷别人家的铃铛。' },
      { title: '捂住耳朵', prompt: STYLE_PREFIX + 'the same man in dark clothes covering his own ears with both hands while reaching for the bell, funny pose, bell ringing', narration: '他捂住自己的耳朵去偷铃铛。' },
      { title: '被人发现', prompt: STYLE_PREFIX + 'the man in dark clothes caught red-handed, embarrassed face, house owner pointing at him, bell on ground', narration: '结果还是被人发现了，自欺欺人是不行的。' }
    ]
  },
  '刻舟求剑': {
    character: 'a foolish scholar in green robe',
    scenes: [
      { title: '剑掉入水中', prompt: STYLE_PREFIX + 'a scholar in green robe on a wooden boat, sword falling from his hand into river with splash, surprised face', narration: '有个人坐船时，剑掉进了水里。' },
      { title: '在船上刻记号', prompt: STYLE_PREFIX + 'the same scholar in green robe carving a mark on the boat side with a knife, river flowing, other passengers watching', narration: '他在船上刻了个记号，想等船停了再找。' },
      { title: '找不到剑', prompt: STYLE_PREFIX + 'the scholar in green robe searching in water at dock, boat has moved far away, confused expression, sword visible at original spot underwater', narration: '船已经走了，剑却还在原来的地方，他当然找不到了。' }
    ]
  },
  '愚公移山': {
    character: 'an old man with white beard in brown clothes',
    scenes: [
      { title: '愚公决心', prompt: STYLE_PREFIX + 'an old man with long white beard in brown clothes pointing at two huge mountains blocking his door, determined face, family behind him', narration: '愚公年纪很大了，但他决心要移走门前的两座大山。' },
      { title: '全家人挖山', prompt: STYLE_PREFIX + 'the old man with white beard leading his whole family digging at mountain with shovels and baskets, teamwork, dust flying', narration: '他带领全家人一起挖山不止。' },
      { title: '山神感动', prompt: STYLE_PREFIX + 'two mountain gods in clouds looking down at the determined old man, moved expression, mountains floating away, magical scene', narration: '他的精神感动了天神，帮他把山搬走了。' }
    ]
  },
  '拔苗助长': {
    character: 'an impatient farmer in yellow clothes',
    scenes: [
      { title: '禾苗生长', prompt: STYLE_PREFIX + 'an impatient farmer in yellow clothes looking at small green rice seedlings in field, anxious expression, sunny day', narration: '有个农夫种了禾苗，希望它们快点长高。' },
      { title: '拔高禾苗', prompt: STYLE_PREFIX + 'the farmer in yellow clothes pulling rice seedlings upward from roots, bad idea, sweat drops, field scene', narration: '他把禾苗一棵棵往上拔，想让它们长快点。' },
      { title: '禾苗枯萎', prompt: STYLE_PREFIX + 'the farmer in yellow clothes crying next to wilted dead seedlings, devastated expression, other healthy field in background', narration: '结果禾苗全都枯死了，急于求成反而坏事。' }
    ]
  },
  '叶公好龙': {
    character: 'a nobleman in fancy purple robe',
    scenes: [
      { title: '叶公爱龙', prompt: STYLE_PREFIX + 'a nobleman in purple robe admiring his room full of dragon paintings, dragon carvings, dragon vases, happy face', narration: '叶公非常喜欢龙，家里到处都是龙的装饰。' },
      { title: '真龙降临', prompt: STYLE_PREFIX + 'a magnificent real dragon with golden scales appearing at the window of the same purple-robed nobleman house, magical clouds', narration: '有一天，一条真龙听说了，就来拜访他。' },
      { title: '叶公惊恐', prompt: STYLE_PREFIX + 'the nobleman in purple robe terrified, hiding under table, the same golden dragon looking confused at window, dramatic contrast', narration: '叶公吓得躲到桌子底下，原来他并不是真的喜欢龙。' }
    ]
  },
  '对牛弹琴': {
    character: 'a musician in white robe with a guqin instrument',
    scenes: [
      { title: '音乐家弹琴', prompt: STYLE_PREFIX + 'a musician in white robe playing guqin instrument to a brown cow in green meadow, beautiful music notes floating', narration: '有个音乐家对着牛弹奏美妙的音乐。' },
      { title: '牛不理会', prompt: STYLE_PREFIX + 'the same musician in white robe playing passionately, the brown cow eating grass ignoring him completely, funny contrast', narration: '可是牛只顾着吃草，根本不听。' },
      { title: '恍然大悟', prompt: STYLE_PREFIX + 'the musician in white robe packing up guqin, realizing expression, the brown cow still eating, lesson learned scene', narration: '他这才明白，对不懂的人讲道理是没有用的。' }
    ]
  },
  '杯弓蛇影': {
    character: 'a nervous scholar in blue robe',
    scenes: [
      { title: '看到蛇影', prompt: STYLE_PREFIX + 'a scholar in blue robe at banquet table, seeing snake shadow in wine cup, scared expression, bow on wall behind casting shadow', narration: '有个人喝酒时，看到杯中有蛇的影子。' },
      { title: '疑心生病', prompt: STYLE_PREFIX + 'the scholar in blue robe lying sick in bed, worried face, imagining snakes, dark bedroom', narration: '他疑心很重，回家后就生病了。' },
      { title: '真相大白', prompt: STYLE_PREFIX + 'the scholar in blue robe at same banquet, showing the bow on wall creating shadow in cup, relieved happy face', narration: '后来发现那只是弓的倒影，他的病立刻就好了。' }
    ]
  },
  '破釜沉舟': {
    character: 'a brave general in red armor',
    scenes: [
      { title: '砸破锅碗', prompt: STYLE_PREFIX + 'a brave general in red armor commanding soldiers to smash cooking pots, determined army, war camp scene', narration: '将军命令砸破锅碗，表示决一死战。' },
      { title: '沉没船只', prompt: STYLE_PREFIX + 'the general in red armor watching boats sink in river, soldiers cheering, no retreat scene', narration: '又把船只沉入河中，断绝退路。' },
      { title: '英勇胜利', prompt: STYLE_PREFIX + 'the general in red armor leading victorious army, flags waving, celebration, battle won', narration: '士兵们奋勇作战，最终取得了胜利。' }
    ]
  },
  '卧薪尝胆': {
    character: 'a determined king in simple grey clothes',
    scenes: [
      { title: '战败受辱', prompt: STYLE_PREFIX + 'a king in simple grey clothes sleeping rough on firewood pile, humble room, determined angry expression, night', narration: '越王勾践战败后，每天睡在柴草上。' },
      { title: '尝苦胆', prompt: STYLE_PREFIX + 'the king in grey clothes tasting a bitter gall bladder hanging from ceiling, grimacing but determined, same humble room', narration: '他每天尝苦胆，提醒自己不要忘记耻辱。' },
      { title: '最终复仇', prompt: STYLE_PREFIX + 'the same king now in golden armor leading large army to victory, triumphant expression, flags flying', narration: '经过多年努力，他终于打败了敌人，报了仇。' }
    ]
  },
  '望梅止渴': {
    character: 'a clever general in silver armor',
    scenes: [
      { title: '行军口渴', prompt: STYLE_PREFIX + 'a general in silver armor leading tired thirsty soldiers marching in hot sun, dry landscape, desert road', narration: '曹操带兵行军，士兵们都很口渴。' },
      { title: '说起梅子', prompt: STYLE_PREFIX + 'the general in silver armor pointing ahead telling soldiers about plum trees, clever smile, soldiers listening', narration: '曹操说前面有梅林，梅子又酸又甜。' },
      { title: '士兵流涎', prompt: STYLE_PREFIX + 'soldiers imagining juicy plums in thought bubbles, salivating, feeling refreshed, the general in silver armor smiling', narration: '士兵们想到梅子，口水都流出来了，也不那么渴了。' }
    ]
  },
  '纸上谈兵': {
    character: 'a young scholar-general in white armor',
    scenes: [
      { title: '熟读兵书', prompt: STYLE_PREFIX + 'a young scholar in white armor reading military books at desk, confident expression, books stacked around', narration: '赵括熟读兵书，谈论军事头头是道。' },
      { title: '上战场', prompt: STYLE_PREFIX + 'the young scholar now in white armor on horseback leading army, looking nervous, real battlefield, chaotic', narration: '他当上将军后，却只会纸上谈兵。' },
      { title: '惨遭失败', prompt: STYLE_PREFIX + 'the young scholar in white armor defeated, army scattered, regretful expression, learning moment', narration: '结果在实战中惨败，只会理论是不够的。' }
    ]
  },
  '指鹿为马': {
    character: 'a scheming minister in black robe and a young emperor',
    scenes: [
      { title: '指着鹿', prompt: STYLE_PREFIX + 'a minister in black robe presenting a deer to young emperor on throne, court hall, scheming smile', narration: '赵高牵来一只鹿，对皇帝说是马。' },
      { title: '大臣争论', prompt: STYLE_PREFIX + 'court officials arguing, some pointing at deer saying horse, some confused, divided court hall scene', narration: '大臣们有的说是鹿，有的附和说是马。' },
      { title: '忠臣被害', prompt: STYLE_PREFIX + 'honest officials being dragged away by guards, the minister in black robe watching smugly, dark scene', narration: '说是鹿的忠臣后来都被赵高害死了。' }
    ]
  },
  '完璧归赵': {
    character: 'a clever envoy in white robe with jade',
    scenes: [
      { title: '蔺相如出使', prompt: STYLE_PREFIX + 'a clever envoy in white robe carrying a glowing jade piece, traveling to Qin kingdom, determined face', narration: '蔺相如带着和氏璧出使秦国。' },
      { title: '秦王耍赖', prompt: STYLE_PREFIX + 'the envoy in white robe holding jade protectively, angry king on throne trying to grab it, tense confrontation', narration: '秦王想白白得到宝玉，不肯给城池。' },
      { title: '完璧归赵', prompt: STYLE_PREFIX + 'the envoy in white robe safely returning home with jade, welcoming crowd, triumphant scene', narration: '蔺相如机智勇敢，终于把宝玉完好带回赵国。' }
    ]
  },
  '负荆请罪': {
    character: 'an old general with beard and a wise minister in white',
    scenes: [
      { title: '廉颇不服', prompt: STYLE_PREFIX + 'an old general with thick beard looking angry and jealous, arms crossed, proud stance', narration: '廉颇觉得自己功劳大，不服蔺相如。' },
      { title: '蔺相如避让', prompt: STYLE_PREFIX + 'a wise minister in white robe stepping aside on road to let the bearded general pass, humble expression', narration: '蔺相如为了国家大局，处处避让廉颇。' },
      { title: '负荆请罪', prompt: STYLE_PREFIX + 'the old general with beard carrying thorns on back, kneeling to apologize to the minister in white robe, emotional reconciliation', narration: '廉颇深受感动，背着荆条去请罪，两人成为好友。' }
    ]
  },
  '闻鸡起舞': {
    character: 'a young warrior with sword',
    scenes: [
      { title: '听到鸡叫', prompt: STYLE_PREFIX + 'a young man waking up startled by rooster crowing at dawn, getting out of bed, dark sky, early morning', narration: '祖逖听到鸡叫就起床练剑。' },
      { title: '刻苦练剑', prompt: STYLE_PREFIX + 'the same young man practicing sword moves in early morning light, sweat drops, determined face, courtyard', narration: '他每天天不亮就起来刻苦练武。' },
      { title: '成为名将', prompt: STYLE_PREFIX + 'the young man now grown into a brave general in armor leading army, confident smile, victory flag', narration: '后来他成为了一名英勇的将军，保卫国家。' }
    ]
  }
};

const SCENE_DESCRIPTIONS = {
  '画蛇添足': ['众人比赛画蛇', '有人给蛇添脚', '反而输掉比赛'],
  '守株待兔': ['兔子撞树而死', '农夫天天等待', '田地荒芜'],
  '亡羊补牢': ['羊圈破洞丢羊', '修补羊圈', '不再丢羊'],
  '井底之蛙': ['青蛙在井底', '海龟说大海', '青蛙惊讶'],
  '狐假虎威': ['狐狸骑老虎', '动物都害怕', '老虎发现真相'],
  '掩耳盗铃': ['看到铃铛', '捂耳偷铃', '被人发现'],
  '刻舟求剑': ['剑掉入水中', '船上刻记号', '找不到剑'],
  '愚公移山': ['决心移山', '全家挖山', '天神帮忙'],
  '拔苗助长': ['禾苗生长', '往上拔苗', '禾苗枯萎'],
  '叶公好龙': ['到处是龙装饰', '真龙来访', '吓得躲起来'],
  '对牛弹琴': ['对牛弹琴', '牛不理会', '恍然大悟'],
  '杯弓蛇影': ['杯中蛇影', '疑心生病', '发现是弓影'],
  '破釜沉舟': ['砸破锅碗', '沉没船只', '英勇胜利'],
  '卧薪尝胆': ['睡柴草上', '每天尝胆', '最终复仇'],
  '望梅止渴': ['行军口渴', '说起梅林', '士兵流涎'],
  '纸上谈兵': ['熟读兵书', '上战场', '惨遭失败'],
  '指鹿为马': ['指鹿为马', '大臣争论', '忠臣被害'],
  '完璧归赵': ['出使秦国', '秦王耍赖', '完璧归赵'],
  '负荆请罪': ['廉颇不服', '蔺相如避让', '负荆请罪'],
  '闻鸡起舞': ['听到鸡叫', '刻苦练剑', '成为名将']
};

const MEANINGS = {
  '画蛇添足': '比喻做多余的事，反而不恰当',
  '守株待兔': '比喻不主动努力，希望得到意外收获',
  '亡羊补牢': '比喻出了问题以后想办法补救',
  '井底之蛙': '比喻见识狭隘、目光短浅的人',
  '狐假虎威': '比喻仰仗别人的权势来欺压人',
  '掩耳盗铃': '比喻自己欺骗自己',
  '刻舟求剑': '比喻拘泥于成法，不知变通',
  '愚公移山': '比喻坚持不懈地改造自然',
  '拔苗助长': '比喻违反客观规律，急于求成',
  '叶公好龙': '比喻自称爱好某事物，其实并不是真爱好',
  '对牛弹琴': '比喻对不懂道理的人讲道理',
  '杯弓蛇影': '比喻因疑神疑鬼而引起恐惧',
  '破釜沉舟': '比喻下定决心，不留退路',
  '卧薪尝胆': '比喻刻苦自励，发愤图强',
  '望梅止渴': '比喻用空想来安慰自己',
  '纸上谈兵': '比喻空谈理论，不能解决实际问题',
  '指鹿为马': '比喻颠倒黑白，混淆是非',
  '完璧归赵': '比喻把原物完好地归还本人',
  '负荆请罪': '表示向人认错赔罪',
  '闻鸡起舞': '比喻有志报国的人及时奋起'
};

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 下载图片到本地
function downloadImage(url, filepath) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    const file = fs.createWriteStream(filepath);

    protocol.get(url, (response) => {
      // 处理重定向
      if (response.statusCode === 301 || response.statusCode === 302) {
        downloadImage(response.headers.location, filepath).then(resolve).catch(reject);
        return;
      }

      if (response.statusCode !== 200) {
        reject(new Error(`下载失败: ${response.statusCode}`));
        return;
      }

      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve(filepath);
      });
    }).on('error', (err) => {
      fs.unlink(filepath, () => {});
      reject(err);
    });
  });
}

async function generateImage(prompt, idiom, sceneIndex) {
  const truncatedPrompt = prompt.length > 300 ? prompt.substring(0, 300) : prompt;

  for (let i = 0; i < 5; i++) {
    try {
      const response = await fetch(`${API_BASE}/images/generations`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'agnes-image-2.1-flash',
          prompt: truncatedPrompt,
          size: '512x512'
        })
      });

      if (response.ok) {
        const data = await response.json();
        const imageUrl = data.data[0]?.url;

        if (imageUrl) {
          // 立即下载图片
          const imageFilename = `${idiom}_${sceneIndex + 1}.png`;
          const imageFilepath = path.join(IMAGES_DIR, imageFilename);

          try {
            await downloadImage(imageUrl, imageFilepath);
            console.log(`    ✅ 图片已保存: ${imageFilename}`);
            return `/pre-generated/images/${imageFilename}`;
          } catch (downloadErr) {
            console.log(`    ⚠️ 图片下载失败: ${downloadErr.message}`);
            return imageUrl; // fallback to URL
          }
        }
      }

      console.log(`    重试 ${i + 1}/5...`);
      await sleep(3000 * (i + 1));
    } catch (err) {
      console.log(`    错误: ${err.message}`);
      await sleep(3000 * (i + 1));
    }
  }
  return null;
}

async function generateBook(idiom, index) {
  console.log(`\n[${index + 1}/20] 生成: ${idiom}`);

  const template = SCENE_TEMPLATES[idiom];
  const descriptions = SCENE_DESCRIPTIONS[idiom];
  const meaning = MEANINGS[idiom];

  const scenes = [];

  for (let i = 0; i < template.scenes.length; i++) {
    const scene = template.scenes[i];
    console.log(`  场景 ${i + 1}: ${scene.title}`);

    const imagePath = await generateImage(scene.prompt, idiom, i);

    scenes.push({
      id: i + 1,
      title: scene.title,
      description: descriptions[i],
      prompt: scene.prompt,
      narration: scene.narration,
      imageUrl: imagePath || ''
    });

    await sleep(1000);
  }

  return {
    id: `book-${Date.now()}-${index}`,
    title: idiom,
    idiom: idiom,
    meaning: meaning,
    createdAt: new Date().toISOString(),
    scenes: scenes
  };
}

async function main() {
  console.log('========================================');
  console.log('批量生成20个成语绘本');
  console.log('========================================\n');

  // 创建目录
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
  if (!fs.existsSync(IMAGES_DIR)) {
    fs.mkdirSync(IMAGES_DIR, { recursive: true });
  }

  const books = [];

  for (let i = 0; i < IDIOM_LIST.length; i++) {
    const idiom = IDIOM_LIST[i];
    const filename = `${idiom}.json`;
    const filepath = path.join(OUTPUT_DIR, filename);

    // 检查是否已存在
    if (fs.existsSync(filepath)) {
      console.log(`\n[${i + 1}/20] 跳过: ${idiom} (已存在)`);
      const existingBook = JSON.parse(fs.readFileSync(filepath, 'utf-8'));
      books.push(existingBook);
      continue;
    }

    const book = await generateBook(idiom, i);
    books.push(book);

    // 保存单个绘本
    fs.writeFileSync(filepath, JSON.stringify(book, null, 2), 'utf-8');
    console.log(`  ✅ 绘本已保存: ${filename}`);

    // 每5个成语暂停一下
    if ((i + 1) % 5 === 0) {
      console.log(`\n--- 已完成 ${i + 1}/20 ---\n`);
      await sleep(3000);
    }
  }

  // 保存索引文件
  const indexData = books.map(b => ({
    id: b.id,
    title: b.title,
    idiom: b.idiom,
    meaning: b.meaning,
    createdAt: b.createdAt,
    sceneCount: b.scenes.length
  }));

  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'index.json'),
    JSON.stringify(indexData, null, 2),
    'utf-8'
  );

  // 统计
  const totalImages = books.reduce((sum, b) => sum + b.scenes.filter(s => s.imageUrl && s.imageUrl.includes('/pre-generated/')).length, 0);

  console.log('\n========================================');
  console.log('批量生成完成！');
  console.log(`共生成 ${books.length} 本绘本`);
  console.log(`已下载 ${totalImages} 张图片`);
  console.log(`保存位置: ${OUTPUT_DIR}`);
  console.log('========================================');
}

main().catch(console.error);
