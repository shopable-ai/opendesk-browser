export const openaiApi = {
  id: 'openai-api',
  name: 'OpenAI API 预付余额',
  actions: [
    {
      id: 'fund-organization',
      label: '为指定 API Organization 充值',
      buttonLabel: '打开 OpenAI API 账单入口（不会充值）',
      url: 'https://platform.openai.com/',
      outcome: 'api-prepaid-balance',
      notice: '余额属于被选中的 API Organization。由有账单管理权限的 Owner 核对 Organization、购买金额、Auto Recharge 阈值和月度上限。外部付款人不应为充值被授予宽泛 Owner 权限。',
      confirmer: '目标 API Organization Owner / 账单管理者确认购买。',
      evidence: 'OpenAI API prepaid billing'
    }
  ]
};
