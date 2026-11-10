import { BadRequestException } from '@nestjs/common';
import {
    createSetFormSchema,
    parseSetForm,
    updateSetFormSchema,
} from './multipart-body';

describe('parseSetForm', () => {
    it('parses FE multipart text fields', () => {
        expect(
            parseSetForm(createSetFormSchema, {
                title: 'T',
                isPublic: 'true',
                isPinned: 'false',
                tags: '["a","b"]',
                description: '',
            })
        ).toEqual({
            title: 'T',
            isPublic: true,
            isPinned: false,
            tags: ['a', 'b'],
        });
    });

    it('accepts the JSON shape (real booleans and arrays) too', () => {
        expect(
            parseSetForm(createSetFormSchema, {
                title: 'T',
                isPublic: true,
                tags: ['x'],
            })
        ).toMatchObject({ isPublic: true, isPinned: false, tags: ['x'] });
    });

    it('create defaults: private, unpinned, no tags', () => {
        expect(parseSetForm(createSetFormSchema, { title: 'T' })).toEqual({
            title: 'T',
            isPublic: false,
            isPinned: false,
            tags: [],
        });
    });

    it.each([
        {},
        { title: '' },
        { title: 123 },
        { title: 'T', isPublic: 'yes' },
        { title: 'T', tags: '[oops' },
        { title: 'T', tags: '{"a":1}' },
        { title: 'T', thumbnail: 'not a url' },
    ])('rejects %j with 400', (body) => {
        expect(() => parseSetForm(createSetFormSchema, body)).toThrow(
            BadRequestException
        );
    });

    it('update leaves unsent fields undefined (no silent reset to false/[])', () => {
        expect(parseSetForm(updateSetFormSchema, { title: 'N' })).toEqual({
            title: 'N',
        });
        expect(() =>
            parseSetForm(updateSetFormSchema, { isPinned: 'maybe' })
        ).toThrow(BadRequestException);
    });
});
