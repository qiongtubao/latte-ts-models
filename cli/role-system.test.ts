import {
  BUILTIN_ROLES,
  getRoleById,
  buildJudgePrompt,
  extractJudgeJson,
} from './role-system';

describe('BUILTIN_ROLES', () => {
  it('has 4 roles', () => {
    expect(BUILTIN_ROLES).toHaveLength(4);
  });

  it('each role has an id, name, systemPrompt, and scoreDimensions', () => {
    for (const role of BUILTIN_ROLES) {
      expect(role.id).toBeTruthy();
      expect(role.name).toBeTruthy();
      expect(role.systemPrompt).toBeTruthy();
      expect(Array.isArray(role.scoreDimensions)).toBe(true);
      expect(role.scoreDimensions.length).toBeGreaterThan(0);
    }
  });
});

describe('getRoleById', () => {
  it('returns role for valid id', () => {
    const role = getRoleById('reasoning');
    expect(role).toBeDefined();
    expect(role!.name).toBe('推理专家');
  });

  it('returns undefined for invalid id', () => {
    expect(getRoleById('nonexistent')).toBeUndefined();
  });

  it('finds all builtin roles by id', () => {
    for (const expected of BUILTIN_ROLES) {
      expect(getRoleById(expected.id)).toEqual(expected);
    }
  });
});

describe('buildJudgePrompt', () => {
  it('builds prompt with dimensions, question, and answer', () => {
    const prompt = buildJudgePrompt(
      'What is 2+2?',
      '4',
      ['准确性', '简洁性']
    );
    expect(prompt).toContain('评分裁判');
    expect(prompt).toContain('1. 准确性');
    expect(prompt).toContain('2. 简洁性');
    expect(prompt).toContain('What is 2+2?');
    expect(prompt).toContain('4');
    expect(prompt).toContain('"准确性"');
    expect(prompt).toContain('"简洁性"');
    expect(prompt).toContain('"comment"');
  });
});

describe('extractJudgeJson', () => {
  it('extracts valid JSON from response', () => {
    const result = extractJudgeJson('{"准确性": 8, "comment": "good"}') as any;
    expect(result['准确性']).toBe(8);
    expect(result.comment).toBe('good');
  });

  it('extracts JSON from text with surrounding content', () => {
    const result = extractJudgeJson(
      'Here is my evaluation:\n{"准确性": 7, "comment": "ok"}\nThat is all.'
    ) as any;
    expect(result['准确性']).toBe(7);
  });

  it('handles nested objects', () => {
    const result = extractJudgeJson(
      '{"准确性": 9, "details": {"reason": "excellent"}}'
    ) as any;
    expect(result.details.reason).toBe('excellent');
  });

  it('throws on non-JSON input', () => {
    expect(() => extractJudgeJson('no json here')).toThrow('No JSON found');
  });

  it('handles multi-line JSON', () => {
    const input = `{\n  "准确性": 10,\n  "完整性": 9,\n  "comment": "完美"\n}`;
    const result = extractJudgeJson(input) as any;
    expect(result['准确性']).toBe(10);
    expect(result['完整性']).toBe(9);
  });
});
