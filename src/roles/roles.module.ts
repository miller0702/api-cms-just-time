import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { RolesController } from './roles.controller'
import { RolesService } from './roles.service'

@Module({
  imports: [AuthModule],
  providers: [RolesService],
  controllers: [RolesController],
  exports: [RolesService],
})
export class RolesModule {}
