export const chatgptPersonal = {
  id: 'chatgpt-personal',
  name: 'ChatGPT 个人会员 Plus / Pro',
  actions: [
    {
      id: 'purchase',
      label: '购买 Plus / Pro（绑定当前登录账号）',
      buttonLabel: '打开 ChatGPT 官方购买入口（不会付款）',
      url: 'https://chatgpt.com/',
      outcome: 'personal-subscription',
      notice: '目标账号必须在 ChatGPT 官网登录并核对。个人订阅不能在账号间转移。官方文档没有定义独立访客代付 API。',
      confirmer: '目标账号用户核对账号；付款人确认官方结账。',
      evidence: 'ChatGPT 订阅购买 / 账号归属'
    },
    {
      id: 'gift-credits',
      label: '赠送 ChatGPT Credits（不是 Plus / Pro 会员）',
      buttonLabel: '打开 ChatGPT 官方赠送入口（不会购买或发送）',
      url: 'https://chatgpt.com/',
      outcome: 'gift-credits',
      notice: '符合资格的 Plus / Pro 个人账号可购买 Credits 礼品。收件人必须登录合资格个人账号并主动 Redeem；输入邮箱不会绑定 claim link。扩展不保存 claim link。',
      confirmer: '购买者确认付款并安全发送；收件人核对账号并确认 Redeem。',
      evidence: 'ChatGPT Credits gifting'
    }
  ]
};
