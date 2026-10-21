/**
 * @vitest-environment node
 * Live v34 failure: an ordinary Explain question classified a LaTeX restatement
 * of a choice-only GDP relation as course_material.
 * The ordinary-question guard keeps the answer and withholds course_material.
 */
import { describe, expect, it } from 'vitest';
import { applyClaimLevelGrounding } from './evaluateGroundingProvenance.ts';

const QUESTION = 'What is the cyclical part of real GDP?';
const LIVE_ANSWER = [
  'The **cyclical part of real GDP** is:',
  '',
  '\\[',
  '\\text{Cyclical part of real GDP}',
  '= \\text{real GDP} - \\text{trend real GDP}.',
  '\\]',
  '',
  'It measures the temporary deviations of actual output from its long-run trend:',
  '',
  '- If real GDP is above trend, the cyclical component is positive.',
  '- If real GDP is below trend, the cyclical component is negative.',
].join('\n');
const FORMULA = '\\text{Cyclical part of real GDP}\n= \\text{real GDP} - \\text{trend real GDP}.';

const RETRIEVED = [
  {
    "citationIndex": 1,
    "pageNumber": 2,
    "text": "Recommended Readings Barro, R. J., Chu, A. C., & Cozzi, G. (2017). Intermediate Macroeconomics . Cengage Learning EMEA. Chapter 7, 8, 9 and 10. Multiple Choice Questions 1. The cyclical part of real GDP is ... (a) trend real GDP less real GDP. (b) real GDP less trend real GDP. (c) real GDP divided by trend real GDP. (d) trend real GDP divided by real GDP. 2. An equilibrium business-cycle model ... (a) uses shocks to GDP to find equilibrium conditions. (b) uses GDP to find equilibrium shocks to the economy. (c) uses equilibrium conditions to determine how shocks affect real GDP. (d) uses GDP to find equilibrium conditions. 3. A variable that moves in the same direction as real GDP is known as... (a) acyclical. (b) procyclical. (c) countercyclical. (d) exogenous. 4. Examples of temporary changes in technology would be... (a) a lockdown. (b) a new discovery. (c) a general strike. (d) a harvest failure. 2"
  },
  {
    "citationIndex": 2,
    "pageNumber": 24,
    "text": "Challenging Questions 20. Ravn (1997) formulates a Real Business Cycle Model (RBC) to describe dynamic be- haviour of output, consumption, investment, and hours worked over the business cycle in the UK. In the figure below, one can observe the evolution of the model’s variables following a permanent shock (see Figure 1(a)) and a temporary shock (see Figure 1(b)). The graph is representing the % change of each variable, compared to its value pre-shock, over time. Q = Investment, Y = Output = A.F(N,K), C = Consumption, K = capital stock, N = hours worked. (a) What is the variable through which shocks are represented in the RBC? Name that variable and graph its evolution in Figure1(a) scenario, using the same scale. Solution: All possible shocks (financial crisis, supply disruptions, pandemic) must be represented through perturbations on A/TFP in the RBC model. Since the shock in scenario (a) is permanent, the graph is a constant line, below 0.7 as the change in A must be lower than the change in Y, as N also increased. 24"
  },
  {
    "citationIndex": 3,
    "pageNumber": 27,
    "text": "21. Figure 14.5 depicts GDP, total number of hours worked, consumption, and investment data for the U.S. over 2019 and 2020. “The sharp drop we see is, of course, the economic response to the Covid-19 pandemic, which fits well the supply shock paradigm” - Filipe Cam- pante, Federico Sturzenegger, Andr´ es Velasco. (a) How could you explain the behaviour of these 4 macroeconomic variables, after the COVID-19 outbreak (2020-Q1), according to the RBC model studied in class? Solution: We have a negative TFP shock (i.e., A falls) (which is the only possible answer according to RBC). In this case, the MPL falls, and so does the demand for Labor. This leads to a lower number of hours worked in equilibrium. It also leads to a decrease in Y, both because of A and L*. Students could also refer to the rental market, although not needed. The RBC model predicts that the MPC is lower than 1, even in the case of a permanent shock due to substitution effects, and so investment would necessarily decrease. For consumption, the model is ambiguous regarding its evolution, but the empirical data shows that consumption is pro-cyclical, as observed in the graph. 27"
  },
  {
    "citationIndex": 4,
    "pageNumber": 29,
    "text": "22. In its paper “Real Business Cycle Models: Past, Present, and Future”, Rebelo (2005) reflects on the contribution of real business cycles models to our understanding of economic fluctuations and discusses open issues in business cycle research. Consider this excerpt: “Macroeconomists agree that expansions in output, at least in the medium to long run, are driven by TFP increases that derive from technical progress. In contrast, the notion that short-run recessions are caused by TFP declines meets with substantial skepticism because, interpreted literally, it means that recessions are times of technological regress.” (a) Discuss the statement. How does this constitute a criticism to the RBC model? Solution: The RBC models suggest that business cycles are driven mainly by large and cyclically volatile shocks to productivity, these are represented by Solow residuals."
  },
  {
    "citationIndex": 5,
    "pageNumber": 29,
    "text": "However, the Solow residual as a measure of technical progress creates several problems, since this is poorly measured. Thus, this model will not consider shocks of other sources of shocks. Thus, extensions with variable capital utilization and high elasticity of labor supply were further incorporated. (b) Consider Economy X, which was recently affected by a positive technological shock (TFP). Assume that both labor and capital services supply are elastic. (i) What does the model predict regarding the Labor Market? And about the capital services market? Explain all relevant mechanisms. Solution: In the labor market, we have a shift of the demand curve upwards as a higher level of A implies a higher MPL. Given that each hour of work produces a higher amount of output, firms increase the level of labor demanded."
  },
  {
    "citationIndex": 6,
    "pageNumber": 29,
    "text": "This means that the new equilibrium in this market will happen with a greater L* and a higher real wage rate ( w P ). In the market for capital services (with an elastic supply of capital services), we have a shift of the demand curve upwards as a higher level of A implies a higher MPK. Given that each unit of capital produces a higher amount of output, firms increase the level of capital demanded. This means that the new equilibrium in this market will happen with a greater K* and a higher real rental price. In the bonds market, the nominal interest rate on bonds will also increase in line with the non-arbitrage condition. 29"
  }
] as Array<{
  citationIndex: number;
  pageNumber: number;
  text: string;
}>;

function judge(question: string, answerText: string, rows = RETRIEVED) {
  return applyClaimLevelGrounding({
    question,
    answerText,
    chunks: rows.map((row) => ({ citationIndex: row.citationIndex, text: row.text })),
    contextAvailable: { hasIndexedChunks: true, hasPdfCapture: false },
  });
}

describe('G2.20 live choice-only attribution', () => {
  it('does not classify the live LaTeX answer as course material', () => {
    const result = judge(QUESTION, LIVE_ANSWER);
    expect(result.knowledgeTier).not.toBe('course_material');
    expect(result.text).toContain('real GDP');
    expect(result.text).toContain('not independently verified');
  });

  it('does not let the LaTeX formula alone inherit the question stem', () => {
    const result = judge(QUESTION, FORMULA);
    expect(result.knowledgeTier).not.toBe('course_material');
  });

  it('does not let a citation marker turn the same answer into course material', () => {
    const result = judge(QUESTION, LIVE_ANSWER + ' [1]');
    expect(result.knowledgeTier).not.toBe('course_material');
    expect(result.text).not.toMatch(/\[1\]/);
  });

  it('checks the explanation separately from the formula', () => {
    const explanation = 'It measures the temporary deviations of actual output from its long-run trend.';
    const result = judge(QUESTION, FORMULA + '\n\n' + explanation);
    expect(result.knowledgeTier).not.toBe('course_material');
    expect(result.text).toContain('temporary deviations');
    expect(result.text).toContain('not independently verified');
  });

  it('does not promote the same choice when the operator word is parsed', () => {
    const page2 = RETRIEVED.filter((row) => row.pageNumber === 2);
    expect(page2[0]?.text.includes('\n')).toBe(false);
    expect(page2[0]?.text).toContain('real GDP less trend real GDP');
    const plain = 'The cyclical part of real GDP is real GDP less trend real GDP.';
    const result = judge(QUESTION, plain, page2);
    expect(result.knowledgeTier).toBe('mixed');
  });
});
