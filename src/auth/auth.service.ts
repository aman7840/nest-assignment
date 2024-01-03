import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as nodemailer from 'nodemailer';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async getTokens(
    userId: number,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    // Check if the user exists
    const user = await this.prismaService.getPrisma().user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const accessToken = this.generateAccessToken(userId);

    const refreshToken = this.generateRefreshToken(userId);

    return { accessToken, refreshToken };
  }

  generateAccessToken(userId: number): string {
    // Generate a new access token using the user's ID
    return this.jwtService.sign({
      sub: userId,
    });
  }

  generateRefreshToken(userId: number): string {
    return this.jwtService.sign({ sub: userId }, { expiresIn: '2d' });
  }

  async verifyRefreshToken(refreshToken: string): Promise<number | null> {
    try {
      const decodedToken: { sub: number; expiresIn: string } =
        this.jwtService.verify(refreshToken);
      const userId = decodedToken.sub;
      const user = await this.prismaService.getPrisma().user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        throw new NotFoundException('User Not Found');
      }

      return userId;
    } catch (error) {
      return null;
    }
  }

  private generateRandomOTP(): string {
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    return otp;
  }

  async generateAndSendOTP(email: string): Promise<string | null> {
    const user = await this.prismaService.getPrisma().user.findUnique({
      where: { email },
    });

    if (!user) {
      return null;
    }

    const otp = this.generateRandomOTP();

    await this.sendOTP(email, otp);

    await this.prismaService.getPrisma().user.update({
      where: { id: user.id },
      data: { otp },
    });

    return otp;
  }

  private async sendOTP(email: string, otp: string): Promise<void> {
    try {
      const transporter = nodemailer.createTransport({
        host: this.configService.get('mail.mailHost'),
        port: 587,
        secure: false,
        auth: {
          user: this.configService.get('mail.mailUser'),
          pass: this.configService.get('mail.mailPass'),
        },
      });

      const mailOptions = {
        from: this.configService.get('mail.mailUser'),
        to: email,
        subject: 'OTP Verification',
        text: `Your OTP for verification is: ${otp}`,
      };
      await transporter.sendMail(mailOptions);
    } catch (error) {
      console.log('error', error);
      throw new InternalServerErrorException('Failed to send OTP.');
    }
  }
}
