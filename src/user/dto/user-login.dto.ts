import { IsEmail, IsNotEmpty, Length } from 'class-validator';

export class UserLoginDto {
  @IsNotEmpty()
  @IsEmail()
  @Length(5, 255)
  email: string;

  @IsNotEmpty()
  @Length(6, 50)
  password: string;
}
