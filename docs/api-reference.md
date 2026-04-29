# API Reference

Most API routes require an authenticated session unless noted.

## Authentication

- `GET /api/auth/ping`: returns whether the current session is authenticated.
- `POST /api/register`: creates a user with `name`, `email`, and `password`.
- `POST /api/auth/password-reset`: request or confirm password reset depending on `mode`.
- `/api/auth/[...nextauth]`: Auth.js/NextAuth route handlers.

## AI

- `GET /api/ai/status`: returns provider availability and configuration status.
- `POST /api/ai/chat`: sends chat messages to the configured AI provider.
- `POST /api/ai/explain`: generates an explanation for a question.
- `POST /api/ai/grade-case`: grades a case analysis answer.
- `POST /api/ai/diagnosis`: generates weak-area diagnosis.
- `POST /api/ai/case-methodology`: explains case-solving methodology.
- `POST /api/ai/generate-questions`: generates multiple-choice questions.
- `POST /api/ai/generate-case`: generates a case analysis question.
- `POST /api/ai/variant-questions`: generates variants of an existing question.
- `GET /api/ai/generate-history`: returns AI-generated question history.
- `GET /api/ai/wrong-note-image?wrongNoteId=...`: returns the latest reusable wrong-note explanation image task for the current settings.
- `POST /api/ai/wrong-note-image`: queues or reuses a wrong-note explanation image task. Body: `{ "wrongNoteId": "...", "force": false }`.
- `GET /api/ai/wrong-note-image/batch?wrongNoteIds=id1,id2`: returns task status for multiple wrong notes.
- `POST /api/ai/wrong-note-image/batch`: queues or reuses multiple wrong-note explanation image tasks. Body: `{ "wrongNoteIds": ["..."], "force": false }`.
- `GET /api/ai/wrong-note-image/[id]/file`: streams a generated image file after checking ownership.

Common AI error responses:

- `401`: not authenticated.
- `429`: AI rate limit exceeded.
- `503`: AI provider not configured.
- `502`: provider response could not be parsed.

## Practice

- `GET /api/practice/topics`: returns available practice topics.
- `POST /api/practice/start`: starts a practice session. Body may include `mode`, `topicId`, or generated question IDs.
- `POST /api/practice/answer`: submits an answer for a practice session.
- `GET /api/practice/session/[id]`: returns a practice session and questions.
- `GET /api/practice/summary?sessionId=...`: returns session summary.
- `GET /api/practice/cases`: lists case analysis questions.
- `GET /api/practice/cases/[id]`: returns a case question.
- `POST /api/practice/cases/[id]/answer`: submits case answers.
- `GET /api/practice/cases/[id]/result`: returns case result and scores.

## Exams

- `GET /api/exam`: lists exams.
- `POST /api/exam/generate`: generates a mock exam.
- `GET /api/exam/history`: lists exam attempts.
- `POST /api/exam/[id]/start`: starts or resumes an exam attempt.
- `POST /api/exam/[id]/answer`: saves an exam answer.
- `POST /api/exam/[id]/submit`: submits an attempt and calculates scores.
- `GET /api/exam/[id]/result`: returns attempt result.

## Knowledge and Analytics

- `GET /api/knowledge`: returns the knowledge tree.
- `GET /api/knowledge/[id]`: returns a topic, questions, and related progress.
- `GET /api/analysis`: returns user learning analysis.
- `GET /api/profile/stats`: returns profile summary statistics.
- `GET /api/profile/knowledge-stats`: returns knowledge point mastery data.
- `GET /api/profile/heatmap`: returns daily practice heatmap data.

## Study Plans

- `GET /api/plan`: lists study plans.
- `GET /api/plan/[id]`: returns a plan.
- `PATCH /api/plan/[id]`: updates plan status.
- `DELETE /api/plan/[id]`: deletes a plan.
- `POST /api/plan/generate`: generates a personalized AI study plan.
- `PATCH /api/plan/[id]/day/[dayNumber]`: updates a day item.

## Profile and AI Settings

- `GET /api/profile`: returns the current user profile.
- `PATCH /api/profile`: updates profile name.
- `PATCH /api/profile/password`: changes password.
- `GET /api/profile/ai-settings`: returns user AI settings.
- `PUT /api/profile/ai-settings`: saves user AI settings.
- `DELETE /api/profile/ai-settings`: removes user AI settings.
- `POST /api/profile/ai-settings/test`: tests a provider configuration.
- `POST /api/profile/ai-settings/models`: lists provider models when supported.
- `POST /api/profile/ai-settings/image-test`: tests image provider connectivity through the image model list endpoint.
- `POST /api/profile/ai-settings/image-models`: lists image provider models when supported.

The AI settings endpoints also accept image provider fields: `imageProvider`, `imageModel`, `imageApiKey`, `imageBaseUrl`, `imageSize`, `imageQuality`, `imageOutputFormat`, and `imageStyle`.

## Wrong Notes

- `GET /api/wrong-notes`: lists wrong-note items with filters.
- `PATCH /api/wrong-notes/[id]`: updates wrong-note status.
- `DELETE /api/wrong-notes/[id]`: removes a wrong-note item.
- `POST /api/wrong-notes/retry`: starts a retry practice session from wrong notes.
