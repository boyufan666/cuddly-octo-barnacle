import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Optional,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import {
  AUTH_COOKIE_NAME,
  CSRF_COOKIE_NAME,
  RESET_COOKIE_NAME,
  createCsrfToken,
  csrfCookieOptions,
  isCsrfTokenValid,
  parseCookies,
  sessionCookieOptions,
} from './auth-session';
import { AppService } from './app.service';
import { AuthGuard } from './auth.guard';
import { CurrentUser } from './current-user';
import type { RequestUser } from './current-user';
import {
  PasswordResetGuard,
  type PasswordResetRequest,
} from './password-reset.guard';
import { CsrfGuard } from './csrf.guard';
import { RuntimeReadinessService } from './runtime-readiness.service';
import {
  MimoHighCostOperation,
  MimoHighCostRateLimitGuard,
} from './mimo-high-cost-rate-limit.guard';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    @Optional()
    @Inject(RuntimeReadinessService)
    private readonly runtimeReadiness?: RuntimeReadinessService,
  ) {}

  @Get('health/live')
  live() {
    return { status: 'live', service: 'rehab-platform-api' };
  }

  @Get('health/ready')
  async ready() {
    if (!this.runtimeReadiness) {
      throw new ServiceUnavailableException('运行时就绪检查尚未初始化。');
    }
    return this.runtimeReadiness.assertReady();
  }

  @Post('auth/login')
  @UseGuards(ThrottlerGuard, CsrfGuard)
  async login(
    @Body() body: { account: string; password: string },
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.appService.login(body);
    if (result.status === 'password_reset_required') {
      response.clearCookie(AUTH_COOKIE_NAME, sessionCookieOptions(0));
      response.cookie(
        RESET_COOKIE_NAME,
        result.resetToken,
        sessionCookieOptions(15 * 60 * 1000),
      );
      return { status: result.status, user: result.user };
    }

    response.clearCookie(RESET_COOKIE_NAME, sessionCookieOptions(0));
    response.cookie(
      AUTH_COOKIE_NAME,
      result.sessionToken,
      sessionCookieOptions(8 * 60 * 60 * 1000),
    );
    return {
      status: result.status,
      user: result.user,
      context: result.context,
    };
  }

  @Get('auth/csrf')
  csrf(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const existingToken = parseCookies(request.headers.cookie)[
      CSRF_COOKIE_NAME
    ];
    const csrfToken = isCsrfTokenValid(existingToken)
      ? existingToken
      : createCsrfToken();
    if (csrfToken !== existingToken) {
      response.cookie(
        CSRF_COOKIE_NAME,
        csrfToken,
        csrfCookieOptions(8 * 60 * 60 * 1000),
      );
    }
    return { csrfToken };
  }

  @UseGuards(ThrottlerGuard, PasswordResetGuard)
  @HttpCode(200)
  @Post('auth/password-reset')
  async completePasswordReset(
    @Req() request: Request & PasswordResetRequest,
    @Body() body: { newPassword?: string },
    @Res({ passthrough: true }) response: Response,
  ) {
    const session = request.passwordResetSession!;
    let result;
    try {
      result = await this.appService.completePasswordReset(
        session.sub,
        session.authSessionVersion,
        body,
      );
    } catch (error: unknown) {
      if (error instanceof UnauthorizedException) {
        response.clearCookie(RESET_COOKIE_NAME, sessionCookieOptions(0));
      }
      throw error;
    }
    this.clearAuthCookies(response);
    return result;
  }

  @UseGuards(AuthGuard)
  @HttpCode(200)
  @Post('auth/logout')
  async logout(
    @CurrentUser() user: RequestUser,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.appService.logout(user);
    this.clearAuthCookies(response);
    return result;
  }

  @Post('auth/registration-requests')
  @UseGuards(ThrottlerGuard, CsrfGuard)
  createRegistrationRequest(@Body() body: unknown) {
    return this.appService.createRegistrationRequest(body as never);
  }

  @UseGuards(AuthGuard)
  @Get('me')
  me(@CurrentUser() user: RequestUser) {
    return this.appService.me(user);
  }

  @UseGuards(AuthGuard)
  @HttpCode(200)
  @Post('admin/users/:account/password-reset')
  adminResetPassword(
    @CurrentUser() user: RequestUser,
    @Param('account') account: string,
    @Body() body: { newPassword?: string },
  ) {
    return this.appService.adminResetPassword(user, account, body);
  }

  @UseGuards(AuthGuard)
  @Post('patients')
  createPatient(@CurrentUser() user: RequestUser, @Body() body: unknown) {
    return this.appService.createPatient(user, body as never);
  }

  @UseGuards(AuthGuard)
  @Post('caregivers')
  createCaregiverAccount(
    @CurrentUser() user: RequestUser,
    @Body() body: unknown,
  ) {
    return this.appService.createCaregiverAccount(user, body as never);
  }

  @UseGuards(AuthGuard)
  @Get('patients/:id')
  getPatient(@CurrentUser() user: RequestUser, @Param('id') patientId: string) {
    return this.appService.getPatient(user, patientId);
  }

  @UseGuards(AuthGuard)
  @Post('consents')
  createConsent(@CurrentUser() user: RequestUser, @Body() body: unknown) {
    return this.appService.createConsent(user, body as never);
  }

  @UseGuards(AuthGuard)
  @Patch('consents/:id/revoke')
  revokeConsent(
    @CurrentUser() user: RequestUser,
    @Param('id') consentId: string,
  ) {
    return this.appService.revokeConsent(user, consentId);
  }

  @UseGuards(AuthGuard)
  @Get('patients/:id/caregivers')
  listCaregiverRelations(
    @CurrentUser() user: RequestUser,
    @Param('id') patientId: string,
  ) {
    return this.appService.listCaregiverRelations(user, patientId);
  }

  @UseGuards(AuthGuard)
  @Post('patients/:id/caregivers')
  createCaregiverRelation(
    @CurrentUser() user: RequestUser,
    @Param('id') patientId: string,
    @Body() body: unknown,
  ) {
    return this.appService.createCaregiverRelation(
      user,
      patientId,
      body as never,
    );
  }

  @UseGuards(AuthGuard)
  @Patch('patients/:id/caregivers/:relationId/revoke')
  revokeCaregiverRelation(
    @CurrentUser() user: RequestUser,
    @Param('id') patientId: string,
    @Param('relationId') relationId: string,
  ) {
    return this.appService.revokeCaregiverRelation(user, patientId, relationId);
  }

  @UseGuards(AuthGuard)
  @Get('care-circle/patients/:id/posts')
  listCareCirclePosts(
    @CurrentUser() user: RequestUser,
    @Param('id') patientId: string,
  ) {
    return this.appService.listCareCirclePosts(user, patientId);
  }

  @UseGuards(AuthGuard)
  @Post('care-circle/patients/:id/posts')
  createCareCirclePost(
    @CurrentUser() user: RequestUser,
    @Param('id') patientId: string,
    @Body() body: unknown,
  ) {
    return this.appService.createCareCirclePost(user, patientId, body as never);
  }

  @UseGuards(AuthGuard)
  @Post('care-circle/posts/:id/comments')
  createCareCircleComment(
    @CurrentUser() user: RequestUser,
    @Param('id') postId: string,
    @Body() body: unknown,
  ) {
    return this.appService.createCareCircleComment(user, postId, body as never);
  }

  @UseGuards(AuthGuard)
  @Patch('care-circle/posts/:id/moderate')
  moderateCareCirclePost(
    @CurrentUser() user: RequestUser,
    @Param('id') postId: string,
    @Body() body: unknown,
  ) {
    return this.appService.moderateCareCirclePost(user, postId, body as never);
  }

  @UseGuards(AuthGuard)
  @Post('care-precautions')
  createCarePrecaution(
    @CurrentUser() user: RequestUser,
    @Body() body: unknown,
  ) {
    return this.appService.createCarePrecaution(user, body as never);
  }

  @UseGuards(AuthGuard)
  @Post('assessments')
  createAssessment(@CurrentUser() user: RequestUser, @Body() body: unknown) {
    return this.appService.createAssessment(user, body as never);
  }

  @UseGuards(AuthGuard)
  @Patch('assessments/:id/review')
  reviewAssessment(
    @CurrentUser() user: RequestUser,
    @Param('id') assessmentId: string,
    @Body() body: unknown,
  ) {
    return this.appService.reviewAssessment(user, assessmentId, body as never);
  }

  @MimoHighCostOperation('ai')
  @UseGuards(AuthGuard, MimoHighCostRateLimitGuard)
  @Post('ai/assessment-drafts')
  createAiAssessmentDraft(
    @CurrentUser() user: RequestUser,
    @Body() body: unknown,
  ) {
    return this.appService.createAiAssessmentDraft(user, body as never);
  }

  @UseGuards(AuthGuard)
  @Post('ai/conversations')
  startAiConversation(@CurrentUser() user: RequestUser, @Body() body: unknown) {
    return this.appService.startAiConversation(user, body as never);
  }

  @MimoHighCostOperation('ai')
  @UseGuards(AuthGuard, MimoHighCostRateLimitGuard)
  @Post('ai/conversations/:id/messages')
  appendAiConversationMessage(
    @CurrentUser() user: RequestUser,
    @Param('id') sessionId: string,
    @Body() body: unknown,
  ) {
    return this.appService.appendAiConversationMessage(
      user,
      sessionId,
      body as never,
    );
  }

  @UseGuards(AuthGuard)
  @Patch('ai/conversations/:id/complete')
  completeAiConversation(
    @CurrentUser() user: RequestUser,
    @Param('id') sessionId: string,
    @Body() body: unknown,
  ) {
    return this.appService.completeAiConversation(
      user,
      sessionId,
      body as never,
    );
  }

  @UseGuards(AuthGuard)
  @Patch('ai/conversations/:id/review')
  reviewAiConversation(
    @CurrentUser() user: RequestUser,
    @Param('id') sessionId: string,
    @Body() body: unknown,
  ) {
    return this.appService.reviewAiConversation(user, sessionId, body as never);
  }

  @UseGuards(AuthGuard)
  @Get('ai/conversations/:id/assessment-draft')
  async getAiConversationAssessmentDraft(
    @CurrentUser() user: RequestUser,
    @Param('id') sessionId: string,
  ) {
    return {
      draft: await this.appService.getAiConversationAssessmentDraft(
        user,
        sessionId,
      ),
    };
  }

  @UseGuards(AuthGuard)
  @Get('patients/:id/ai-conversations')
  listPatientAiConversations(
    @CurrentUser() user: RequestUser,
    @Param('id') patientId: string,
  ) {
    return this.appService.listPatientAiConversations(user, patientId);
  }

  @MimoHighCostOperation('speech')
  @UseGuards(AuthGuard, MimoHighCostRateLimitGuard)
  @Post('ai/assessment-speech-transcripts')
  createAssessmentSpeechTranscript(
    @CurrentUser() user: RequestUser,
    @Body() body: unknown,
  ) {
    return this.appService.createAssessmentSpeechTranscript(
      user,
      body as never,
    );
  }

  @MimoHighCostOperation('tts')
  @UseGuards(AuthGuard, MimoHighCostRateLimitGuard)
  @Post('ai/tts-speech-outputs')
  createTtsSpeechOutput(
    @CurrentUser() user: RequestUser,
    @Body() body: unknown,
  ) {
    return this.appService.createTtsSpeechOutput(user, body as never);
  }

  @UseGuards(AuthGuard)
  @Get('patients/:id/assessments')
  listAssessments(
    @CurrentUser() user: RequestUser,
    @Param('id') patientId: string,
  ) {
    return this.appService.listAssessments(user, patientId);
  }

  @UseGuards(AuthGuard)
  @Post('rehab-plans/recommend')
  recommendPlan(@CurrentUser() user: RequestUser, @Body() body: unknown) {
    return this.appService.recommendPlan(user, body as never);
  }

  @UseGuards(AuthGuard)
  @Patch('rehab-plans/:id/confirm')
  confirmPlan(
    @CurrentUser() user: RequestUser,
    @Param('id') planId: string,
    @Body() body: unknown,
  ) {
    return this.appService.confirmPlan(user, planId, body as never);
  }

  @UseGuards(AuthGuard)
  @Get('collection-protocols')
  listCollectionProtocols(@CurrentUser() user: RequestUser) {
    return this.appService.listCollectionProtocols(user);
  }

  @UseGuards(AuthGuard)
  @Get('admin/collection-conditions')
  listCollectionConditions(@CurrentUser() user: RequestUser) {
    return this.appService.listCollectionConditions(user);
  }

  @UseGuards(AuthGuard)
  @Post('admin/collection-conditions')
  createCollectionCondition(
    @CurrentUser() user: RequestUser,
    @Body() body: unknown,
  ) {
    return this.appService.createCollectionCondition(user, body as never);
  }

  @UseGuards(AuthGuard)
  @Post('admin/collection-protocols')
  createCollectionProtocol(
    @CurrentUser() user: RequestUser,
    @Body() body: unknown,
  ) {
    return this.appService.createCollectionProtocol(user, body as never);
  }

  @UseGuards(AuthGuard)
  @Post('collection-batches')
  createCollectionBatch(
    @CurrentUser() user: RequestUser,
    @Body() body: unknown,
  ) {
    return this.appService.createCollectionBatch(user, body as never);
  }

  @UseGuards(AuthGuard)
  @Get('patients/:id/collection-batches')
  listPatientCollectionBatches(
    @CurrentUser() user: RequestUser,
    @Param('id') patientId: string,
  ) {
    return this.appService.listPatientCollectionBatches(user, patientId);
  }

  @UseGuards(AuthGuard)
  @Post('training-sessions')
  startTrainingSession(
    @CurrentUser() user: RequestUser,
    @Body() body: unknown,
  ) {
    return this.appService.startTrainingSession(user, body as never);
  }

  @UseGuards(AuthGuard)
  @HttpCode(200)
  @Post('training-sessions/:id/resume')
  resumeTrainingSession(
    @CurrentUser() user: RequestUser,
    @Param('id') sessionId: string,
  ) {
    return this.appService.resumeTrainingSession(user, sessionId);
  }

  @UseGuards(AuthGuard)
  @HttpCode(200)
  @Post('training-sessions/:id/abort')
  abortTrainingSession(
    @CurrentUser() user: RequestUser,
    @Param('id') sessionId: string,
    @Body() body: unknown,
  ) {
    return this.appService.abortTrainingSession(user, sessionId, body as never);
  }

  @UseGuards(AuthGuard)
  @Post('training-sessions/:id/results')
  submitTrainingResult(
    @CurrentUser() user: RequestUser,
    @Param('id') sessionId: string,
    @Body() body: unknown,
  ) {
    return this.appService.submitTrainingResult(user, sessionId, body as never);
  }

  @UseGuards(AuthGuard)
  @Patch('training-results/:id/review')
  reviewTrainingResult(
    @CurrentUser() user: RequestUser,
    @Param('id') resultId: string,
    @Body() body: unknown,
  ) {
    return this.appService.reviewTrainingResult(user, resultId, body as never);
  }

  @UseGuards(AuthGuard)
  @Get('patients/:id/training-records')
  listTrainingRecords(
    @CurrentUser() user: RequestUser,
    @Param('id') patientId: string,
  ) {
    return this.appService.listTrainingRecords(user, patientId);
  }

  @UseGuards(AuthGuard)
  @Get('patients/:id/rewards')
  listPatientRewards(
    @CurrentUser() user: RequestUser,
    @Param('id') patientId: string,
  ) {
    return this.appService.listPatientRewards(user, patientId);
  }

  @UseGuards(AuthGuard)
  @Get('caregiver/patients/:id/summary')
  caregiverSummary(
    @CurrentUser() user: RequestUser,
    @Param('id') patientId: string,
  ) {
    return this.appService.caregiverSummary(user, patientId);
  }

  @UseGuards(AuthGuard)
  @Get('admin/audit-logs')
  auditLogs(
    @CurrentUser() user: RequestUser,
    @Query() query: Record<string, unknown>,
  ) {
    return this.appService.auditLogs(user, query);
  }

  @UseGuards(AuthGuard)
  @Get('admin/registration-requests')
  listRegistrationRequests(@CurrentUser() user: RequestUser) {
    return this.appService.listRegistrationRequests(user);
  }

  @UseGuards(AuthGuard)
  @Patch('admin/registration-requests/:id/review')
  reviewRegistrationRequest(
    @CurrentUser() user: RequestUser,
    @Param('id') requestId: string,
    @Body() body: unknown,
  ) {
    return this.appService.reviewRegistrationRequest(
      user,
      requestId,
      body as never,
    );
  }

  @UseGuards(AuthGuard)
  @HttpCode(200)
  @Post('admin/exports/:dataset')
  async exportDataset(
    @CurrentUser() user: RequestUser,
    @Param('dataset') dataset: string,
    @Body() body: Record<string, unknown>,
    @Res({ passthrough: true }) response: Response,
  ) {
    const exported = await this.appService.exportDataset(user, dataset, body);
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Pragma', 'no-cache');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${exported.filename}"`,
    );
    if (exported.format === 'csv') {
      response.setHeader('Content-Type', 'text/csv; charset=utf-8');
      return exported.content;
    }
    return exported.payload;
  }

  @UseGuards(AuthGuard)
  @Get('admin/game-contents')
  listGameContents(@CurrentUser() user: RequestUser) {
    return this.appService.listGameContents(user);
  }

  @UseGuards(AuthGuard)
  @Post('admin/game-contents')
  createGameContent(@CurrentUser() user: RequestUser, @Body() body: unknown) {
    return this.appService.createGameContent(user, body as never);
  }

  @UseGuards(AuthGuard)
  @Patch('admin/game-contents/:id/status')
  updateGameContentStatus(
    @CurrentUser() user: RequestUser,
    @Param('id') gameContentId: string,
    @Body() body: unknown,
  ) {
    return this.appService.updateGameContentStatus(
      user,
      gameContentId,
      body as never,
    );
  }

  @UseGuards(AuthGuard)
  @Patch('admin/game-contents/:id/unity-build')
  updateUnityBuildConfig(
    @CurrentUser() user: RequestUser,
    @Param('id') gameContentId: string,
    @Body() body: unknown,
  ) {
    return this.appService.updateUnityBuildConfig(
      user,
      gameContentId,
      body as never,
    );
  }

  @UseGuards(AuthGuard)
  @Get('admin/dashboard')
  dashboard(@CurrentUser() user: RequestUser) {
    return this.appService.dashboard(user);
  }

  private clearAuthCookies(response: Response) {
    response.clearCookie(AUTH_COOKIE_NAME, sessionCookieOptions(0));
    response.clearCookie(RESET_COOKIE_NAME, sessionCookieOptions(0));
    response.clearCookie(CSRF_COOKIE_NAME, csrfCookieOptions(0));
  }
}
