import type { ContentInfo } from './types'

// 各品类内置推荐列表
export const IDIOM_LIST: ContentInfo[] = [
  { sourceText: '画蛇添足', meaning: '比喻做多余的事，反而不恰当', category: 'idiom' },
  { sourceText: '守株待兔', meaning: '比喻不主动努力，希望得到意外收获', category: 'idiom' },
  { sourceText: '亡羊补牢', meaning: '比喻出了问题以后想办法补救', category: 'idiom' },
  { sourceText: '井底之蛙', meaning: '比喻见识狭隘、目光短浅的人', category: 'idiom' },
  { sourceText: '狐假虎威', meaning: '比喻仰仗别人的权势来欺压人', category: 'idiom' },
  { sourceText: '掩耳盗铃', meaning: '比喻自己欺骗自己', category: 'idiom' },
  { sourceText: '刻舟求剑', meaning: '比喻拘泥于成法，不知变通', category: 'idiom' },
  { sourceText: '愚公移山', meaning: '比喻坚持不懈地改造自然', category: 'idiom' },
  { sourceText: '拔苗助长', meaning: '比喻违反客观规律，急于求成', category: 'idiom' },
  { sourceText: '叶公好龙', meaning: '比喻自称爱好某事物，其实并不是真爱好', category: 'idiom' },
]

export const POETRY_LIST: ContentInfo[] = [
  { sourceText: '静夜思', meaning: '床前明月光，疑是地上霜', category: 'poetry', author: '李白', dynasty: '唐' },
  { sourceText: '春晓', meaning: '春眠不觉晓，处处闻啼鸟', category: 'poetry', author: '孟浩然', dynasty: '唐' },
  { sourceText: '咏鹅', meaning: '鹅鹅鹅，曲项向天歌', category: 'poetry', author: '骆宾王', dynasty: '唐' },
  { sourceText: '悯农', meaning: '锄禾日当午，汗滴禾下土', category: 'poetry', author: '李绅', dynasty: '唐' },
  { sourceText: '登鹳雀楼', meaning: '白日依山尽，黄河入海流', category: 'poetry', author: '王之涣', dynasty: '唐' },
  { sourceText: '江雪', meaning: '千山鸟飞绝，万径人踪灭', category: 'poetry', author: '柳宗元', dynasty: '唐' },
  { sourceText: '望庐山瀑布', meaning: '日照香炉生紫烟，遥看瀑布挂前川', category: 'poetry', author: '李白', dynasty: '唐' },
  { sourceText: '绝句', meaning: '两个黄鹂鸣翠柳，一行白鹭上青天', category: 'poetry', author: '杜甫', dynasty: '唐' },
]

export const NURSERY_RHYME_LIST: ContentInfo[] = [
  { sourceText: '小兔子乖乖', meaning: '小兔子乖乖，把门儿开开', category: 'nursery-rhyme' },
  { sourceText: '两只老虎', meaning: '两只老虎，两只老虎，跑得快', category: 'nursery-rhyme' },
  { sourceText: '小燕子', meaning: '小燕子，穿花衣，年年春天来这里', category: 'nursery-rhyme' },
  { sourceText: '数鸭子', meaning: '门前大桥下，游过一群鸭', category: 'nursery-rhyme' },
  { sourceText: '拔萝卜', meaning: '拔萝卜，拔萝卜，嗨吆嗨吆拔不动', category: 'nursery-rhyme' },
  { sourceText: '小星星', meaning: '一闪一闪亮晶晶，满天都是小星星', category: 'nursery-rhyme' },
]

export const PROVERB_LIST: ContentInfo[] = [
  { sourceText: '三个臭皮匠，顶个诸葛亮', meaning: '比喻人多智慧多，集思广益', category: 'proverb' },
  { sourceText: '路遥知马力，日久见人心', meaning: '时间长了才能看出人心的好坏', category: 'proverb' },
  { sourceText: '近朱者赤，近墨者黑', meaning: '接近好人变好，接近坏人变坏', category: 'proverb' },
  { sourceText: '千里送鹅毛，礼轻情意重', meaning: '礼物虽轻但情意深重', category: 'proverb' },
]

export const FAIRY_TALE_LIST: ContentInfo[] = [
  { sourceText: '三只小猪', meaning: '三只小猪盖房子，只有勤劳的老三躲过大灰狼', category: 'fairy-tale' },
  { sourceText: '小红帽', meaning: '小红帽去看外婆，路上遇到了大灰狼', category: 'fairy-tale' },
  { sourceText: '龟兔赛跑', meaning: '骄傲的兔子输给了坚持不懈的乌龟', category: 'fairy-tale' },
  { sourceText: '乌鸦喝水', meaning: '聪明的乌鸦用石子喝到了瓶底的水', category: 'fairy-tale' },
  { sourceText: '狼来了', meaning: '放羊的孩子说谎，最后没人相信他了', category: 'fairy-tale' },
]

// 按品类获取内置列表
export function getContentListByCategory(category: string): ContentInfo[] {
  switch (category) {
    case 'idiom': return IDIOM_LIST
    case 'poetry': return POETRY_LIST
    case 'nursery-rhyme': return NURSERY_RHYME_LIST
    case 'proverb': return PROVERB_LIST
    case 'fairy-tale': return FAIRY_TALE_LIST
    default: return []
  }
}

// 获取单品信息（在所有品类中查找）
export function getContentInfo(sourceText: string, category?: string): ContentInfo | undefined {
  const lists = category
    ? [getContentListByCategory(category)]
    : [IDIOM_LIST, POETRY_LIST, NURSERY_RHYME_LIST, PROVERB_LIST, FAIRY_TALE_LIST]
  for (const list of lists) {
    const found = list.find((item) => item.sourceText === sourceText)
    if (found) return found
  }
  return undefined
}
