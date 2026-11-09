/**
 * Recarrega o conteúdo das 40 semanas a partir de content/weeks.json + trimesters.json.
 * ⚠️ SOBRESCREVE edições feitas no painel admin e volta o status para "pendente de revisão".
 */
import '../server/db.js';
import { seedWeeks } from '../server/seed.js';
seedWeeks({ force: true });
console.log('✔ Semanas recarregadas a partir de /content.');
