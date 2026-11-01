import { Global, Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { PrismaHealthIndicator } from './prisma.health';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  imports: [TerminusModule],
  providers: [PrismaService, PrismaHealthIndicator],
  exports: [PrismaService, PrismaHealthIndicator],
})
export class DatabaseModule {}
