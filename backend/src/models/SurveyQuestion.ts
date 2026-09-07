import { Queryable, db } from './db';

export interface SurveyQuestion {
  question_id: string;
  text: string;
  category: string | null;
  position: number;
  version: string;
}

export class SurveyQuestionModel {
  static async findAll(client?: Queryable): Promise<SurveyQuestion[]> {
    const result = await db(client).query('SELECT * FROM survey_questions ORDER BY position');
    return result.rows as SurveyQuestion[];
  }
}
