import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { isObjectIdString } from '../utils/object-id.util';

/** Validates `:id` route params; responds 400 for anything that is not a 24-char hex ObjectId. */
@Injectable()
export class ParseObjectIdPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (!isObjectIdString(value)) {
      throw new BadRequestException(`Invalid id: ${value}`);
    }
    return value;
  }
}
