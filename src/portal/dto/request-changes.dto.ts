import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { Trim } from '../../common/dto/validators';

export class RequestChangesDto {
  /** What the client wants changed. */
  @IsString()
  @Trim()
  @IsNotEmpty()
  @MaxLength(5000)
  note: string;
}
