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

// 按品类获取内置列表
export function getContentListByCategory(category: string): ContentInfo[] {
  switch (category) {
    case 'idiom': return IDIOM_LIST
    default: return []
  }
}

// 获取单品信息
export function getContentInfo(sourceText: string): ContentInfo | undefined {
  return IDIOM_LIST.find((item) => item.sourceText === sourceText)
}
