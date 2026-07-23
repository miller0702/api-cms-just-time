import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { RolesModule } from '../roles/roles.module'
import { UsersController } from './users.controller'
import { UsersService } from './users.service'

@Module({
  imports: [AuthModule, RolesModule],
  providers: [UsersService],
  controllers: [UsersController],
})
export class UsersModule {}
