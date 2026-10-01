/** Мини-язык формул: лексер, парсер и вычислитель без eval. */
export { ExprError, parse, type Node } from './parser';
export {
  FORMULA_VARIABLES,
  checkFormula,
  compileFormula,
  type CheckResult,
  type Formula,
  type FormulaVariable,
} from './compile';
