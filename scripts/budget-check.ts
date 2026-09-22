import { readFile } from "node:fs/promises";
import { checkBudget } from "../infra/budget/guard";
try {
  const file = process.env.BUDGET_USAGE_FILE || "infra/budget/usage.example.json";
  const result = checkBudget(JSON.parse(await readFile(file, "utf8")));
  console.info(JSON.stringify(result, null, 2));
  process.exitCode = result.allowPaidOperations ? 0 : 2;
} catch { console.error("Budget check refused: missing or invalid input; values omitted"); process.exitCode = 2; }
