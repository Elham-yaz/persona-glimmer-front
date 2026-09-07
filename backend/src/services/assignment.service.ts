import { randomInt } from 'crypto';
import pool, { withTransaction } from '../config/database';
import { getAssignmentMode, isForcedAssignmentAllowed } from '../config/study';
import { CellCount, SessionModel } from '../models/Session';

export interface Assignment {
  agentConditionId: number;
  contextId: number;
}

export interface ForcedAssignment {
  agentConditionId: number;
  contextId: number;
}

// Serializes balanced assignments so concurrent session creations see fresh counts.
const BALANCED_ASSIGNMENT_LOCK_KEY = 7_120_002;

function pickUniform<T>(items: T[]): T {
  return items[randomInt(0, items.length)];
}

function toAssignment(cell: CellCount): Assignment {
  return { agentConditionId: cell.agent_condition_id, contextId: cell.context_id };
}

/** Uniform over all cells. */
export function chooseRandomCell(cells: CellCount[]): Assignment {
  return toAssignment(pickUniform(cells));
}

/** Uniform among the cells with the fewest started sessions. */
export function chooseBalancedCell(cells: CellCount[]): Assignment {
  const minimum = Math.min(...cells.map((cell) => cell.started));
  const leastPopulated = cells.filter((cell) => cell.started === minimum);
  return toAssignment(pickUniform(leastPopulated));
}

export class AssignmentService {
  /**
   * Decide the (agent condition, context) cell for a new session and create the row.
   * `force` is honored only when ALLOW_FORCED_ASSIGNMENT=true; otherwise it is ignored.
   */
  static async createAssignedSession(options: {
    externalId: string | null;
    model: string;
    promptVersion: string;
    force?: ForcedAssignment;
  }) {
    const { externalId, model, promptVersion, force } = options;

    if (force && isForcedAssignmentAllowed()) {
      await AssignmentService.assertCellExists(force);
      return SessionModel.create({
        agentConditionId: force.agentConditionId,
        contextId: force.contextId,
        externalId,
        model,
        promptVersion,
      });
    }

    if (getAssignmentMode() === 'balanced') {
      return withTransaction(async (client) => {
        await client.query('SELECT pg_advisory_xact_lock($1)', [BALANCED_ASSIGNMENT_LOCK_KEY]);
        const cells = await SessionModel.countStartedPerCell(client);
        AssignmentService.assertCellsSeeded(cells);
        const chosen = chooseBalancedCell(cells);
        return SessionModel.create({ ...chosen, externalId, model, promptVersion }, client);
      });
    }

    const cells = await SessionModel.countStartedPerCell(pool);
    AssignmentService.assertCellsSeeded(cells);
    const chosen = chooseRandomCell(cells);
    return SessionModel.create({ ...chosen, externalId, model, promptVersion });
  }

  private static assertCellsSeeded(cells: CellCount[]): void {
    if (cells.length === 0) {
      throw new Error('No agent conditions / contexts are seeded; run `npm run seed`');
    }
  }

  private static async assertCellExists(force: ForcedAssignment): Promise<void> {
    const cells = await SessionModel.countStartedPerCell(pool);
    const exists = cells.some(
      (cell) =>
        cell.agent_condition_id === force.agentConditionId && cell.context_id === force.contextId
    );
    if (!exists) {
      throw new Error(
        `Forced cell (agent ${force.agentConditionId}, context ${force.contextId}) does not exist`
      );
    }
  }
}
