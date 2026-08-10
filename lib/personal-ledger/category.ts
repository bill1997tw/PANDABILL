export const PERSONAL_EXPENSE_CATEGORIES = [
  "餐飲",
  "交通",
  "住宿",
  "購物",
  "娛樂",
  "其他"
] as const;

export type PersonalExpenseCategory =
  (typeof PERSONAL_EXPENSE_CATEGORIES)[number];

const CATEGORY_RULES: Array<{
  category: Exclude<PersonalExpenseCategory, "其他">;
  keywords: string[];
}> = [
  {
    category: "住宿",
    keywords: ["飯店", "酒店", "hotel", "hostel", "民宿", "旅館", "airbnb", "住宿"]
  },
  {
    category: "交通",
    keywords: [
      "捷運", "mrt", "高鐵", "台鐵", "火車", "公車", "巴士", "計程車",
      "taxi", "uber", "grab", "機票", "飛機", "船票", "租車", "加油",
      "停車", "過路費"
    ]
  },
  {
    category: "娛樂",
    keywords: [
      "電影票", "電影", "門票", "展覽", "遊樂園", "ktv", "卡拉ok", "酒吧",
      "按摩", "景點", "入場券"
    ]
  },
  {
    category: "餐飲",
    keywords: [
      "超商食品", "早餐店", "早餐", "午餐", "晚餐", "宵夜", "咖啡", "飲料",
      "啤酒", "餐廳", "拉麵", "燒肉", "火鍋", "便當", "麥當勞", "茶", "酒"
    ]
  },
  {
    category: "購物",
    keywords: [
      "衣服", "鞋子", "藥妝", "伴手禮", "紀念品", "購物", "百貨", "超商",
      "便利商店", "7-11", "全家"
    ]
  }
];

function normalizeItem(item: string) {
  return item.toLocaleLowerCase("zh-TW").replace(/\s+/gu, "");
}

export function classifyPersonalExpense(item: string): PersonalExpenseCategory {
  const normalized = normalizeItem(item);

  for (const rule of CATEGORY_RULES) {
    if (rule.keywords.some((keyword) => normalized.includes(keyword))) {
      return rule.category;
    }
  }

  return "其他";
}

export function normalizePersonalExpenseCategory(
  category: string | null | undefined
): PersonalExpenseCategory {
  return PERSONAL_EXPENSE_CATEGORIES.includes(
    category as PersonalExpenseCategory
  )
    ? (category as PersonalExpenseCategory)
    : "其他";
}
