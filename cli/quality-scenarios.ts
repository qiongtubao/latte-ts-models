export type QualityScenario = 'needle_haystack' | 'long_summary' | 'cross_file_fix';

export interface ScenarioContent {
  scenario: QualityScenario;
  windowSize: number;
  prompt: string;             // full user message (content + question)
  question: string;           // the actual question (used for judge scoring)
  expectedAnswer?: string;    // for needle_haystack: the secret key
  scoringDimensions: string[];
}

export const SCENARIO_LABELS: Record<QualityScenario, string> = {
  needle_haystack: '信息检索 (Needle in Haystack)',
  long_summary: '长文档摘要 (Long Summary)',
  cross_file_fix: '跨文件代码修复 (Cross-file Fix)',
};

export const SCENARIO_DIMENSIONS: Record<QualityScenario, string[]> = {
  needle_haystack: ['信息检索准确度'],
  long_summary: ['完整性', '准确性', '简洁性'],
  cross_file_fix: ['准确性', '代码质量'],
};

export const WINDOW_SIZE_OPTIONS = [4096, 8192, 16384, 32768, 65536, 131072];

/** Rough token estimation: Chinese ~3 chars/token, English ~4 chars/token */
export function estimateTokens(text: string): number {
  let chineseChars = 0;
  let otherChars = 0;
  for (const ch of text) {
    if (/[\u4e00-\u9fff]/.test(ch)) {
      chineseChars++;
    } else {
      otherChars++;
    }
  }
  return Math.ceil(chineseChars / 1.5 + otherChars / 3.5);
}

/** Generate filler text to approximately reach target token count */
export function generateFiller(targetTokens: number): string {
  const sentences = [
    '人工智能技术正在以前所未有的速度改变着人类社会的方方面面。',
    '从医疗诊断到自动驾驶，从金融风控到智能制造，AI的应用场景不断拓展。',
    '深度学习模型的参数规模在过去几年中呈现指数级增长，推动了自然语言处理领域的突破性进展。',
    '大规模语言模型的出现使得机器能够理解和生成更加自然流畅的人类语言。',
    '研究人员发现，随着模型规模的扩大，许多新的能力会自发涌现出来，这被称为涌现能力。',
    '在计算机视觉领域，Transformer架构已经逐渐取代了传统的卷积神经网络成为主流。',
    '多模态学习允许模型同时处理文本、图像、音频等多种类型的数据，大大拓展了AI的应用边界。',
    '强化学习通过与环境的交互来学习最优策略，在游戏、机器人控制等领域取得了令人瞩目的成就。',
    '迁移学习技术使得在小数据集上训练高质量模型成为可能，降低了AI应用的门槛。',
    '联邦学习通过在保护数据隐私的前提下进行分布式模型训练，解决了数据孤岛问题。',
    '模型压缩和量化技术使得大型AI模型能够在资源受限的边缘设备上高效运行。',
    '可解释性AI研究致力于让模型的决策过程更加透明，增加用户对AI系统的信任。',
    '数据增强技术通过对训练数据进行各种变换来增加数据多样性，提高模型的泛化能力。',
    '自监督学习利用数据本身的结构来生成训练信号，减少了对人工标注的依赖。',
    '元学习旨在让模型学会如何学习，从而能够快速适应新的任务和领域。',
    '对比学习通过拉近相似样本、推开不同样本来学习有效的特征表示。',
    '知识蒸馏技术可以将大型教师模型的知识压缩到小型学生模型中，实现模型的轻量化部署。',
    '对抗训练通过引入对抗样本来增强模型的鲁棒性，提高对恶意攻击的抵抗能力。',
    '持续学习研究如何让模型在连续学习新任务的同时不遗忘之前学到的知识。',
    '提示工程通过精心设计输入提示来引导大语言模型生成更准确、更有用的输出结果。',
  ];

  let result = '';
  while (estimateTokens(result) < targetTokens) {
    // Pick 3 random sentences per paragraph for variety
    const paragraph: string[] = [];
    const used = new Set<number>();
    while (paragraph.length < 3) {
      const idx = Math.floor(Math.random() * sentences.length);
      if (!used.has(idx)) {
        used.add(idx);
        paragraph.push(sentences[idx]);
      }
    }
    result += paragraph.join('') + '\n\n';
  }
  return result;
}

function generateSecretKey(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let key = '';
  for (let i = 0; i < 8; i++) {
    key += chars[Math.floor(Math.random() * chars.length)];
  }
  return key;
}

// ===== Scenario 1: Needle in Haystack =====

export function generateNeedleHaystack(windowSize: number): ScenarioContent {
  const secretKey = generateSecretKey();
  const secretLine = `\n\n【重要通知】本次测试的密钥是：${secretKey}。请务必记住此密钥，后续验证需要使用。\n\n`;
  const secretTokens = estimateTokens(secretLine);
  const fillerTokens = windowSize - secretTokens - 100; // reserve for question

  let filler = generateFiller(Math.max(fillerTokens, 0));

  // Insert secret at random position (20%-80% of the text)
  const fillerLen = filler.length;
  const insertPos = Math.floor(fillerLen * (0.2 + Math.random() * 0.6));
  filler = filler.slice(0, insertPos) + secretLine + filler.slice(insertPos);

  const question = '请问这段文本中的密钥是什么？请只回答密钥本身，不要包含其他内容。';
  const prompt = filler + '\n\n' + question;

  return {
    scenario: 'needle_haystack',
    windowSize,
    prompt,
    question,
    expectedAnswer: secretKey,
    scoringDimensions: SCENARIO_DIMENSIONS.needle_haystack,
  };
}

// ===== Scenario 2: Long Document Summarization =====

export function generateLongSummary(windowSize: number): ScenarioContent {
  const sections = [
    {
      title: '一、引言与背景',
      body: '随着数字化浪潮的深入推进，企业面临的竞争环境日益复杂。传统的运营模式已无法满足快速变化的市场需求，数字化转型成为企业生存和发展的必由之路。在这一背景下，如何有效利用人工智能、大数据、云计算等新兴技术来提升企业核心竞争力，成为管理者和技术人员共同关注的焦点。数字化转型不仅仅是技术的升级，更是组织架构、业务流程、企业文化的全面变革。成功的数字化转型需要从战略层面进行顶层设计，从执行层面进行精细化管理，从文化层面进行全员赋能。',
    },
    {
      title: '二、核心技术架构设计',
      body: '在技术层面，现代化的企业架构通常采用微服务架构来替代传统的单体应用架构。微服务架构将一个大型应用拆分为多个小型、独立的服务单元，每个服务都可以独立开发、测试、部署和扩展。这种架构风格带来了更高的灵活性和可维护性，但也引入了服务间通信、数据一致性、分布式事务等新的挑战。为了应对这些挑战，业界提出了服务网格、事件驱动架构、CQRS模式等多种解决方案。同时，容器化技术如Docker和编排平台如Kubernetes的广泛应用，大大简化了微服务的部署和运维管理。在数据层面，企业需要构建统一的数据中台，整合来自不同业务系统的数据资源，提供统一的数据服务接口。',
    },
    {
      title: '三、安全与合规考量',
      body: '安全是任何技术方案中不可忽视的重要环节。企业需要建立全方位的安全防护体系，包括网络安全、应用安全、数据安全等多个层面。在网络安全方面，需要部署防火墙、入侵检测系统、DDoS防护等措施。在应用安全方面，需要实施身份认证、访问控制、输入验证、SQL注入防护等安全机制。在数据安全方面，需要对敏感数据进行加密存储和传输，建立完善的数据备份和灾难恢复机制。此外，随着GDPR、个人信息保护法等法规的出台，企业还需要确保数据处理流程符合相关合规要求，包括数据最小化原则、用户知情同意、数据可携带权等。',
    },
    {
      title: '四、性能优化策略',
      body: '系统性能直接影响用户体验和业务转化率。性能优化需要从多个维度入手：前端层面可以通过代码分割、懒加载、资源压缩、CDN加速等手段减少页面加载时间；后端层面可以通过数据库索引优化、查询缓存、连接池管理、异步处理等方式提高服务响应速度；架构层面可以通过引入消息队列进行削峰填谷、使用缓存中间件减少数据库压力、采用读写分离和分库分表策略来应对高并发场景。性能监控和告警系统也是必不可少的组成部分，通过实时监控关键性能指标，可以及时发现和解决性能瓶颈。',
    },
    {
      title: '五、项目管理与团队协作',
      body: '成功的项目交付离不开有效的项目管理和团队协作。敏捷开发方法论如Scrum和Kanban已被广泛应用于软件开发团队中，通过短周期的迭代开发和持续的反馈改进，提高了项目的交付质量和客户满意度。DevOps文化的推广打破了开发和运维之间的壁垒，通过自动化工具链实现了持续集成、持续交付和持续部署。在团队协作方面，现代协作工具如Git、Jira、Confluence、Slack等大大提高了团队的沟通效率。此外，建立完善的代码评审机制、编写高质量的技术文档、进行定期的知识分享和技术培训，都有助于提升团队的整体技术水平和项目质量。',
    },
    {
      title: '六、未来展望与总结',
      body: '展望未来，人工智能技术将继续深入渗透到企业运营的各个环节。大语言模型的应用将从简单的问答场景扩展到代码生成、文档撰写、数据分析、决策支持等更复杂的领域。边缘计算和物联网技术的发展将使得实时数据处理和智能决策能力延伸到网络的边缘。区块链技术在供应链管理、数字身份认证、智能合约等领域的应用也将逐步成熟。企业需要保持对新兴技术的敏锐洞察，同时坚持业务驱动、价值导向的原则，避免为了技术而技术的盲目投入。真正的数字化转型成功，体现在通过技术手段实现业务价值的倍增，创造可持续的竞争优势。',
    },
  ];

  let article = sections.map(s => s.title + '\n\n' + s.body).join('\n\n');
  const question = '\n\n请用3句话提炼以上文章的核心观点，并列出5个具体的待办事项建议。';

  // Pad with filler if needed
  const currentTokens = estimateTokens(article + question);
  if (currentTokens < windowSize) {
    const fillerNeeded = windowSize - currentTokens;
    const fillerSections = [
      { title: '补充阅读：行业最佳实践', body: '在实施上述方案的过程中，企业可以参考行业内领先企业的成功经验。例如，某大型电商平台通过引入智能推荐算法，将用户转化率提升了35%；某金融机构利用NLP技术实现了智能客服，将人工客服工作量减少了60%；某制造企业通过部署工业物联网平台，实现了生产线的预测性维护，将设备停机时间降低了45%。这些案例充分说明了技术应用的巨大价值潜力，同时也提醒我们在技术选型和方案设计时需要充分考虑企业的实际情况和业务需求，避免生搬硬套。成功的数字化转型需要结合企业自身的特点，制定切实可行的实施路线图，并在执行过程中不断调整和优化。'},
    ];
    const fillerText = fillerSections.map(s => '\n\n' + s.title + '\n\n' + s.body).join('');
    article += generateFiller(fillerNeeded - estimateTokens(fillerText) - 50) + fillerText;
  }

  const prompt = article + '\n\n' + question;

  return {
    scenario: 'long_summary',
    windowSize,
    prompt,
    question,
    scoringDimensions: SCENARIO_DIMENSIONS.long_summary,
  };
}

// ===== Scenario 3: Cross-file Code Fix =====

export function generateCrossFileFix(windowSize: number): ScenarioContent {
  const file1 = `// ===== 文件 1: src/components/UserProfile.tsx =====
import React, { useState, useEffect } from 'react';

interface User {
  id: number;
  name: string;
  email: string;
  role: string;
  createdAt: string;
}

export default function UserProfile() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchUser(1);
  }, []);

  async function fetchUser(id: number) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(\`/api/users/\${id}\`);
      if (!res.ok) {
        throw new Error(\`HTTP \${res.status}: \${res.statusText}\`);
      }
      const data: User = await res.json();
      setUser(data);
    } catch (err: any) {
      setError(err.message || '获取用户信息失败');
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <div className="loading">加载中...</div>;
  if (error) return <div className="error">错误: {error}</div>;
  if (!user) return <div className="empty">未找到用户信息</div>;

  return (
    <div className="user-profile">
      <h2>{user.name}</h2>
      <p>邮箱: {user.email}</p>
      <p>角色: {user.role}</p>
      <p>注册时间: {new Date(user.createdAt).toLocaleDateString()}</p>
    </div>
  );
}`;

  const file2 = `// ===== 文件 2: server/routes/users.ts =====
import express, { Request, Response } from 'express';

const router = express.Router();

interface User {
  id: number;
  name: string;
  email: string;
  role: string;
  createdAt: string;
}

// 模拟数据库
const users: User[] = [
  { id: 1, name: '张三', email: 'zhangsan@example.com', role: 'admin', createdAt: '2024-01-15' },
  { id: 2, name: '李四', email: 'lisi@example.com', role: 'user', createdAt: '2024-02-20' },
  { id: 3, name: '王五', email: 'wangwu@example.com', role: 'user', createdAt: '2024-03-10' },
];

// GET /api/users/:id
router.get('/:id', (req: Request, res: Response) => {
  // BUG: 没有对 id 参数进行类型校验和错误处理
  // 当用户传入非数字的 id 时（如 /api/users/abc），parseInt 返回 NaN
  // 而 find 方法会因为 NaN !== NaN 的特性导致永远找不到用户
  // 并且没有任何错误提示返回给调用方
  const id = parseInt(req.params.id);
  const user = users.find(u => u.id === id);

  if (!user) {
    // BUG: 当 id 为 NaN 时，这里不会返回 404，而是因为 NaN !== NaN
    // 导致 find 永远返回 undefined，直接走到这里
    // 但调用方无法区分为"用户不存在"还是"参数格式错误"
    return res.status(404).json({ error: '用户不存在' });
  }

  res.json(user);
});

// BUG: 缺少通用的错误处理中间件
// 如果路由处理过程中抛出未预期的异常，没有统一的错误兜底
// 调用方会收到不友好的默认响应

export default router;`;

  const mainPrompt = `以下是一个 Web 应用的两个关联文件，请仔细分析这两个文件的代码，找出其中的 Bug 并给出详细的修复方案。

${file1}

${file2}

请找出代码中的 Bug 并给出修复方案。请明确指出：
1. Bug 的具体位置和原因
2. 修复方案（提供修复后的代码）
3. 如何防止类似问题再次发生`;

  // Pad with filler to reach window size
  const currentTokens = estimateTokens(mainPrompt);
  let prompt = mainPrompt;
  if (currentTokens < windowSize) {
    const fillerNeeded = windowSize - currentTokens;
    const additionalContext = `

// ===== 补充项目上下文 =====
// 项目使用 Express 5 + React 18 + TypeScript 5
// 数据库使用 PostgreSQL，通过 Prisma ORM 进行数据访问
// API 使用 RESTful 风格设计，所有响应均为 JSON 格式
// 前端使用 Vite 构建工具，状态管理使用 React Context + useReducer
// 项目遵循 ESLint 严格模式规则，使用 Prettier 进行代码格式化

/*
 * 项目目录结构:
 * src/
 *   components/     - React UI 组件
 *   hooks/          - 自定义 React Hooks
 *   utils/          - 工具函数
 * server/
 *   routes/         - Express 路由处理
 *   middleware/      - Express 中间件
 *   services/       - 业务逻辑层
 *   models/         - 数据模型定义
 *
 * 错误处理规范:
 * - 所有 API 错误应返回统一的错误格式: { error: string, code: string, details?: any }
 * - 输入参数应在路由层进行校验，校验失败返回 400
 * - 业务逻辑错误应返回对应的 HTTP 状态码 (404/409/422 等)
 * - 服务端内部错误返回 500，并记录详细日志
 */`;

    prompt += generateFiller(fillerNeeded - estimateTokens(additionalContext) - 50) + additionalContext;
  }

  const question = '请找出代码中的 Bug 并给出修复方案。';

  return {
    scenario: 'cross_file_fix',
    windowSize,
    prompt,
    question,
    scoringDimensions: SCENARIO_DIMENSIONS.cross_file_fix,
  };
}

// ===== Dispatcher =====

export function generateScenario(scenario: QualityScenario, windowSize: number): ScenarioContent {
  switch (scenario) {
    case 'needle_haystack':
      return generateNeedleHaystack(windowSize);
    case 'long_summary':
      return generateLongSummary(windowSize);
    case 'cross_file_fix':
      return generateCrossFileFix(windowSize);
    default:
      throw new Error(`Unknown scenario: ${scenario}`);
  }
}
