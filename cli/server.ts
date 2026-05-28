import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import {
  getGlobalConfig,
  getProjectConfig,
  addProvider,
  deleteProvider,
  updateProvider,
  getJudgeConfig,
  setJudgeConfig,
} from './config-writer';
import { AIClient } from '../src/core/ai-client';
import { runBenchmark, BenchmarkResult } from './benchmark-runner';
import { BUILTIN_ROLES, getRoleById, buildJudgePrompt, extractJudgeJson } from './role-system';
import { generateScenario, QualityScenario } from './quality-scenarios';

export function createServer(port: number = 3456) {
  const app = express();
  app.use(cors());
  app.use(express.json());

  // ========== 配置 API ==========

  app.get('/api/config/global', (_req, res) => {
    res.json(getGlobalConfig());
  });

  app.get('/api/config/project', (_req, res) => {
    res.json(getProjectConfig());
  });

  app.post('/api/config/global', (req, res) => {
    const { name, provider } = req.body;
    if (!name || !provider) return res.status(400).json({ error: 'Missing name or provider' });
    addProvider('global', name, provider);
    res.json({ success: true });
  });

  app.post('/api/config/project', (req, res) => {
    const { name, provider } = req.body;
    if (!name || !provider) return res.status(400).json({ error: 'Missing name or provider' });
    addProvider('project', name, provider);
    res.json({ success: true });
  });

  app.delete('/api/config/global/:name', (req, res) => {
    deleteProvider('global', req.params.name);
    res.json({ success: true });
  });

  app.delete('/api/config/project/:name', (req, res) => {
    deleteProvider('project', req.params.name);
    res.json({ success: true });
  });

  app.put('/api/config/global/:name', (req, res) => {
    updateProvider('global', req.params.name, req.body.provider);
    res.json({ success: true });
  });

  app.put('/api/config/project/:name', (req, res) => {
    updateProvider('project', req.params.name, req.body.provider);
    res.json({ success: true });
  });

  app.get('/api/config/judge', (_req, res) => {
    res.json(getJudgeConfig() || {});
  });

  app.put('/api/config/judge', (req, res) => {
    setJudgeConfig(req.body);
    res.json({ success: true });
  });

  // ========== Benchmark API ==========

  const benchmarkHistory: BenchmarkResult[] = [];

  app.post('/api/benchmark/run', async (req, res) => {
    const { provider, model, inputTokens, maxOutputTokens } = req.body;

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    const send = (data: object) => res.write(`data: ${JSON.stringify(data)}\n\n`);

    try {
      const client = new AIClient();
      // Use "provider/model" format so AIClient can resolve the correct provider
      const modelRef = provider ? `${provider}/${model}` : model;
      const result = await runBenchmark(client, modelRef, inputTokens, maxOutputTokens, (chunk) => {
        send({ type: 'text', delta: chunk });
      });

      send({ type: 'ttft', ms: result.ttftMs });

      let cumulative = result.ttftMs;
      for (const t of result.tokenTimings) {
        cumulative += t;
        send({ type: 'token_timing', ms: t, cumulativeMs: Math.round(cumulative) });
      }

      send({ type: 'done', result });
      benchmarkHistory.unshift(result);
      if (benchmarkHistory.length > 100) benchmarkHistory.pop();
    } catch (error: any) {
      send({ type: 'error', message: error.message });
    }

    res.end();
  });

  app.get('/api/benchmark/history', (_req, res) => {
    res.json(benchmarkHistory);
  });

  // ========== Quality Benchmark API ==========

  interface QualityTestResult {
    scenario: string;
    windowSize: number;
    scores: Record<string, number>;
    comment?: string;
    modelAnswer?: string;
    status: 'success' | 'error';
    errorMessage?: string;
  }

  interface QualityHistoryItem {
    timestamp: number;
    model: string;
    scenario: string;
    results: QualityTestResult[];
  }

  const qualityHistory: QualityHistoryItem[] = [];

  app.post('/api/quality/run', async (req, res) => {
    const { provider, model, judgeModel, scenario, windowSizes } = req.body;

    if (!model || !scenario || !windowSizes?.length) {
      res.status(400).json({ error: 'Missing required fields: model, scenario, windowSizes' });
      return;
    }

    if (!judgeModel) {
      res.status(400).json({ error: '请先在配置管理中设置评分模型 (Judge Model)' });
      return;
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    const send = (data: object) => res.write(`data: ${JSON.stringify(data)}\n\n`);

    try {
      const client = new AIClient();
      const modelRef = provider ? `${provider}/${model}` : model;
      const total = windowSizes.length;
      const results: QualityTestResult[] = [];

      send({ type: 'start', totalTests: total });

      for (let i = 0; i < windowSizes.length; i++) {
        const windowSize: number = windowSizes[i];

        // Phase 1: Generate scenario content
        send({ type: 'progress', phase: 'generating', scenario, windowSize, current: i, total });
        const generated = generateScenario(scenario as QualityScenario, windowSize);

        // Phase 2: Ask LLM (stream first, fall back to non-streaming)
        send({ type: 'progress', phase: 'asking', scenario, windowSize, current: i, total });
        let answer = '';
        let streamFailed = false;
        try {
          const response = await client.chatStream(
            [{ role: 'user', content: generated.prompt }],
            { model: modelRef },
            (event) => {
              if (event.type === 'text') {
                answer += event.delta;
                send({ type: 'text', delta: event.delta });
              }
            }
          );
        } catch (askErr: any) {
          // Streaming failed — try non-streaming fallback
          streamFailed = true;
          try {
            send({ type: 'text', delta: '(流式失败，使用非流式模式)...\n' });
            answer = await client.query(generated.prompt, { model: modelRef });
            send({ type: 'text', delta: answer });
          } catch (fallbackErr: any) {
            results.push({
              scenario,
              windowSize,
              scores: {},
              status: 'error',
              errorMessage: `模型调用失败: ${askErr.message}`,
            });
            send({ type: 'result', result: results[results.length - 1] });
            continue;
          }
        }

        // Phase 3: Judge the answer
        send({ type: 'progress', phase: 'judging', scenario, windowSize, current: i, total });
        try {
          // Build judge prompt with expected answer context for needle_haystack
          const judgeExtra = generated.expectedAnswer
            ? `\n\n【正确答案/预期要点】\n${generated.expectedAnswer}`
            : '';
          const judgePrompt = buildJudgePrompt(
            generated.question + judgeExtra,
            answer,
            generated.scoringDimensions
          );
          const judgeResp = await new AIClient().query(judgePrompt, { model: judgeModel });
          const scores = extractJudgeJson(judgeResp) as Record<string, number> & { comment?: string };
          const { comment, ...dimensionScores } = scores;
          results.push({
            scenario,
            windowSize,
            scores: dimensionScores as Record<string, number>,
            comment: comment as string | undefined,
            modelAnswer: answer,
            status: 'success',
          });
        } catch (judgeErr: any) {
          results.push({
            scenario,
            windowSize,
            scores: {},
            status: 'error',
            errorMessage: `评分失败: ${judgeErr.message}`,
          });
        }
        send({ type: 'result', result: results[results.length - 1] });
      }

      send({ type: 'done', results });
      qualityHistory.unshift({ timestamp: Date.now(), model, scenario, results });
      if (qualityHistory.length > 50) qualityHistory.pop();
    } catch (error: any) {
      send({ type: 'error', message: error.message });
    }
    res.end();
  });

  app.get('/api/quality/history', (_req, res) => {
    res.json(qualityHistory);
  });

  // ========== Chat + Score API ==========

  interface ChatSession {
    id: string;
    roleId: string;
    model: string;
    question: string;
    answer: string;
    timestamp: number;
    autoScore?: Record<string, number> & { comment?: string };
    manualScore?: { rating: number; tags: string[]; comment: string };
  }

  const chatSessions: ChatSession[] = [];
  let sessionIdCounter = 0;

  app.post('/api/chat/ask', async (req, res) => {
    const { roleId, model: modelRef, question, systemPrompt: customPrompt } = req.body;

    const role = getRoleById(roleId);
    if (!role && !customPrompt) {
      res.status(400).json({ error: 'Invalid role' });
      return;
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    const send = (data: object) => res.write(`data: ${JSON.stringify(data)}\n\n`);

    try {
      const client = new AIClient();
      const sessionId = `session-${++sessionIdCounter}`;

      let answer = '';
      const response = await client.chatStream(
        [{ role: 'user', content: question }],
        {
          model: modelRef,
          systemPrompt: customPrompt || role!.systemPrompt,
        },
        (event) => {
          if (event.type === 'text') {
            answer += event.delta;
            send({ type: 'text', delta: event.delta });
          }
        }
      );

      chatSessions.unshift({
        id: sessionId,
        roleId: roleId || 'custom',
        model: response.model,
        question,
        answer,
        timestamp: Date.now(),
      });

      send({ type: 'done', sessionId, answer, model: response.model, usage: response.usage });
    } catch (error: any) {
      send({ type: 'error', message: error.message });
    }
    res.end();
  });

  app.post('/api/chat/score', async (req, res) => {
    const { sessionId, judgeModel, dimensions } = req.body;

    const session = chatSessions.find(s => s.id === sessionId);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    try {
      const client = new AIClient();
      const prompt = buildJudgePrompt(session.question, session.answer, dimensions);
      const response = await client.query(prompt, { model: judgeModel });
      const scores = extractJudgeJson(response);
      session.autoScore = scores as any;
      res.json(scores);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/chat/score/manual', (req, res) => {
    const { sessionId, rating, tags, comment } = req.body;
    const session = chatSessions.find(s => s.id === sessionId);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    session.manualScore = { rating, tags, comment };
    res.json({ success: true });
  });

  app.get('/api/chat/sessions', (_req, res) => {
    res.json(chatSessions.slice(0, 50));
  });

  app.get('/api/chat/report', (_req, res) => {
    const byRole: Record<string, { scores: Record<string, number[]>; count: number }> = {};
    for (const s of chatSessions) {
      if (!s.autoScore) continue;
      if (!byRole[s.roleId]) byRole[s.roleId] = { scores: {}, count: 0 };
      byRole[s.roleId].count++;
      for (const [dim, val] of Object.entries(s.autoScore)) {
        if (dim === 'comment') continue;
        if (!byRole[s.roleId].scores[dim]) byRole[s.roleId].scores[dim] = [];
        byRole[s.roleId].scores[dim].push(val as number);
      }
    }

    const report: Record<string, Record<string, number>> = {};
    for (const [role, data] of Object.entries(byRole)) {
      report[role] = {};
      for (const [dim, vals] of Object.entries(data.scores)) {
        report[role][dim] = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length * 10) / 10;
      }
    }
    res.json(report);
  });

  app.get('/api/chat/roles', (_req, res) => {
    res.json(BUILTIN_ROLES);
  });

  // ========== 静态文件（生产模式） ==========
  const distUiPath = path.join(process.cwd(), 'dist-ui');
  if (fs.existsSync(distUiPath)) {
    app.use(express.static(distUiPath));
  }

  // ========== 兜底：SPA history fallback ==========
  app.get('/{*path}', (_req, res) => {
    const indexPath = path.join(process.cwd(), 'dist-ui', 'index.html');
    if (fs.existsSync(indexPath)) {
      res.sendFile(indexPath);
    } else {
      res.json({ message: 'latte-ts-models API server running. UI not built yet.' });
    }
  });

  return app;
}

export function startServer(port: number = 3456) {
  const app = createServer(port);
  app.listen(port, () => {
    console.log(`latte-ts-models UI server: http://localhost:${port}`);
  });
  return app;
}
