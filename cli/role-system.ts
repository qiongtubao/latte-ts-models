export interface Role {
  id: string;
  name: string;
  systemPrompt: string;
  scoreDimensions: string[];
}

export const BUILTIN_ROLES: Role[] = [
  {
    id: 'reasoning',
    name: '推理专家',
    systemPrompt: '你是一名逻辑推理专家。请逐步推理，给出严密的分析，最终得出结论。',
    scoreDimensions: ['准确性', '逻辑严密性', '推理深度'],
  },
  {
    id: 'documentation',
    name: '技术文档撰写者',
    systemPrompt: '你是一名技术文档工程师。请写出清晰、准确、结构化的技术文档。',
    scoreDimensions: ['准确性', '可读性', '结构清晰度'],
  },
  {
    id: 'code-review',
    name: '资深代码审查员',
    systemPrompt: '你是一名资深代码审查员。请审查代码的安全性、性能、可维护性，给出改进建议。',
    scoreDimensions: ['准确性', '代码质量', '安全性'],
  },
  {
    id: 'qa',
    name: 'QA 测试工程师',
    systemPrompt: '你是一名 QA 测试工程师。请设计全面的测试用例，覆盖正常流程、边界条件和异常场景。',
    scoreDimensions: ['准确性', '边界覆盖度', '用例可执行性'],
  },
];

export function getRoleById(id: string): Role | undefined {
  return BUILTIN_ROLES.find(r => r.id === id);
}

export function buildJudgePrompt(question: string, answer: string, dimensions: string[]): string {
  const dimList = dimensions.map((d, i) => `${i + 1}. ${d}`).join('\n');
  return `你是一个严格的评分裁判。请根据【用户问题】和【模型回答】，从以下维度打分(1-10)：

${dimList}

【用户问题】
${question}

【模型回答】
${answer}

请仅返回 JSON 格式，不含其他内容：
{${dimensions.map(d => `"${d}": <1-10>`).join(', ')}, "comment": "<简短评语>"}`;
}

export function extractJudgeJson(text: string): object {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No JSON found in judge response');
  return JSON.parse(match[0]);
}
