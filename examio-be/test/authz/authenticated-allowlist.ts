/**
 * Every HTTP handler that is plain `@Authenticated()` (any verified user) or
 * `@RequireOwnerOrPermission(...)` must be listed here with proof of its
 * isolation (RT-6 / RT-7):
 *  - `spec`: a two-user negative spec file; at least one test title in it
 *    contains `key`;
 *  - `selfScoped: true`: the handler only ever touches the caller's own data
 *    and its route has no path parameter (e.g. auth `me`).
 * `handler-declarations.spec.ts` fails on a missing entry, a stale entry, a
 * missing spec file, a title without the key, or a `selfScoped` entry whose
 * route takes a parameter. Phase 07 appends its handlers here.
 */
export type AllowlistEntry =
    | { key: string; spec: string; selfScoped?: undefined }
    | { key: string; selfScoped: true; spec?: undefined };

const exam = (file: string) =>
    `apps/exam-service/test/ownership/${file}.ownership.e2e-spec.ts`;
const auth = (file: string) =>
    `apps/auth-service/test/ownership/${file}.ownership.e2e-spec.ts`;

export const AUTHENTICATED_ALLOWLIST: AllowlistEntry[] = [
    // exam-service
    {
        key: 'ExamAttemptController.getExamAttemptDetail',
        spec: exam('examattempt'),
    },
    {
        key: 'ExamAttemptController.getExamAttemptById',
        spec: exam('examattempt'),
    },
    {
        key: 'ExamAttemptController.updateExamAttempt',
        spec: exam('examattempt'),
    },
    { key: 'FlashcardsetController.getForStudy', spec: exam('flashcardset') },
    {
        key: 'FlashcardStudyController.saveProgress',
        spec: exam('flashcard-study'),
    },
    {
        key: 'FlashcardStudyController.getProgress',
        spec: exam('flashcard-study'),
    },
    // exam-service quiz practice (phase 07)
    // `@RequireOwnerOrPermission('quiz:practice', QuizSetOwnerResolver)`: set owner or STUDENT; the service
    // then needs a grant on the set (whitelist / code / public), proved in the spec below.
    { key: 'QuizPracticeController.startAttempt', spec: exam('quiz-practice') },
    // plain `@Authenticated()`: an attempt belongs to its examinee (owner in `where`) and an open one also
    // needs the grant to still hold
    { key: 'QuizPracticeController.getAttempt', spec: exam('quiz-practice') },
    { key: 'QuizPracticeController.saveAttempt', spec: exam('quiz-practice') },
    { key: 'QuizPracticeController.submitAttempt', spec: exam('quiz-practice') },
    { key: 'QuizPracticeController.listAttempts', spec: exam('quiz-practice') },

    // auth-service: caller-only data, no path parameter
    { key: 'AuthController.logout', selfScoped: true },
    { key: 'AuthController.sendVerificationEmail', selfScoped: true },
    { key: 'AuthController.verifyAccount', selfScoped: true },
    { key: 'AuthController.sendCodeChangePassword', selfScoped: true },
    { key: 'AuthController.changePassword', selfScoped: true },
    { key: 'AuthController.getUser', selfScoped: true },
    { key: 'AuthController.syncRefreshToken', selfScoped: true },
    { key: 'ProfileController.getProfile', selfScoped: true },
    { key: 'ProfileController.updateProfile', selfScoped: true },
    { key: 'ProfileController.uploadAvatar', selfScoped: true },
    { key: 'ProfileController.uploadBanner', selfScoped: true },
    { key: 'DevicesController.getDevices', spec: auth('devices') },
    { key: 'DevicesController.logoutDevice', spec: auth('devices') },
    { key: 'DevicesController.logoutAllOthers', spec: auth('devices') },
];

/**
 * WebSocket gateway classes that are NOT declared `@Authenticated()` at class
 * level. Empty on purpose: the study-room gateway declares it.
 */
export const WS_DOCUMENTED: Record<string, string> = {};
