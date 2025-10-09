import { ModeOneSourceKey, MODE_ONE_QUERY_FALLBACK_SOURCES } from '@/features/mode-one/ModeOne.types.ts';

export const BATCH_SIZE_PER_SOURCE = 4;

export const SOURCE_CONFIG: Array<{ key: ModeOneSourceKey; matchers: string[] }> = [
    { key: 'hentai2read', matchers: ['hentai2read'] },
    { key: 'hitomi', matchers: ['hitomi'] },
    { key: 'ehentai', matchers: ['ehentai', 'e-hentai', 'eh'] },
    { key: 'hentaifox', matchers: ['hentaifox', 'hentai-fox', 'hentai fox'] },
];

export type SyntheticTagDefinition = {
    label: string;
    aliases?: string[];
};

export const HENTAI2READ_SYNTHETIC_TAGS: SyntheticTagDefinition[] = [
    { label: 'anal' },
    { label: 'ahegao' },
    { label: 'big breasts', aliases: ['big tits', 'large breasts'] },
    { label: 'bondage' },
    { label: 'bukkake' },
    { label: 'cumflation' },
    { label: 'dickgirl on male', aliases: ['futa on male', 'futanari on male', 'male pegged'] },
    { label: 'dickgirl on female', aliases: ['futa on female', 'futanari on female'] },
    { label: 'dickgirl on dickgirl', aliases: ['futa on futa'] },
    { label: 'femboy', aliases: ['femboi'] },
    { label: 'femdom', aliases: ['female domination'] },
    { label: 'feminization', aliases: ['sissy', 'forced feminization'] },
    { label: 'futanari', aliases: ['futa', 'dickgirl'] },
    { label: 'gender bender', aliases: ['gender-bender'] },
    { label: 'glasses' },
    { label: 'group sex', aliases: ['group', 'orgy'] },
    { label: 'handjob', aliases: ['hand job'] },
    { label: 'incest' },
    { label: 'interracial' },
    { label: 'maid' },
    { label: 'milf' },
    { label: 'mind control', aliases: ['mind-control', 'mindbreak', 'mind break'] },
    { label: 'monster girl', aliases: ['monster girls'] },
    { label: 'nurse' },
    { label: 'pegging', aliases: ['male pegging', 'strap-on play'] },
    { label: 'pregnancy', aliases: ['impregnation', 'pregnant'] },
    { label: 'rape', aliases: ['non-con', 'noncon', 'sexual assault'] },
    { label: 'schoolgirl uniform', aliases: ['schoolgirl', 'school girl'] },
    { label: 'shotacon', aliases: ['shota'] },
    { label: 'strap-on', aliases: ['strapon'] },
    { label: 'succubus' },
    { label: 'tentacles', aliases: ['tentacle'] },
    { label: 'threesome', aliases: ['3some'] },
    { label: 'vanilla' },
    { label: 'voyeurism' },
    { label: 'yaoi' },
    { label: 'yuri' },
];

export const QUERY_FALLBACK_SOURCES = new Set<ModeOneSourceKey>(MODE_ONE_QUERY_FALLBACK_SOURCES);
