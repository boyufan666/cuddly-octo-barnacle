import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { AppService } from './app.service';
import { AuthGuard } from './auth.guard';
import { CurrentUser } from './current-user';
import type { RequestUser } from './current-user';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('health')
  health() {
    return { status: 'ok', service: 'rehab-platform-api' };
  }

  @Post('auth/login')
  login(@Body() body: { account: string; password: string }) {
    return this.appService.login(body);
  }

  @UseGuards(AuthGuard)
  @Get('me')
  me(@CurrentUser() user: RequestUser) {
    return this.appService.me(user);
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
  @Post('assessments')
  createAssessment(@CurrentUser() user: RequestUser, @Body() body: unknown) {
    return this.appService.createAssessment(user, body as never);
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
  @Post('training-sessions')
  startTrainingSession(
    @CurrentUser() user: RequestUser,
    @Body() body: unknown,
  ) {
    return this.appService.startTrainingSession(user, body as never);
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
}
