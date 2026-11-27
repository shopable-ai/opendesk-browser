export const geminiApi = {
  id: 'gemini-api',
  name: 'Gemini API / AI Studio 计费',
  actions: [
    {
      id: 'fund-project',
      label: '为指定 Google Cloud Project 配置 Gemini API 计费',
      buttonLabel: '打开 Google AI Studio 账单入口（不会充值或绑定）',
      url: 'https://aistudio.google.com/',
      outcome: 'cloud-billing-prepay',
      notice: 'Gemini API Prepay 余额属于 Cloud Billing 账户，不属于 Google AI Pro。更换计费关联或启用 Prepay 可能影响同一账户下其他项目。跨客户共享计费账户需先核对 Google Cloud 条款；扩展不自动关联。',
      confirmer: '项目管理员和计费账户管理员分别核对并确认官方操作。',
      evidence: 'Google AI Studio / Cloud Billing'
    }
  ]
};
