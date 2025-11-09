/*
 * Mini UI for selecting tags with fuzzy search
 * Shows tag aliases and synonyms when Enter is pressed
 */

import { MODE_ONE_SOURCE_LABELS, ModeOneSourceKey } from '@/features/mode-one/ModeOne.types.ts';
import {
    getTagSuggestionCoverage,
    getTagSuggestions,
    getTagSynonyms,
    initializeTagSynonyms,
    TagSuggestion,
} from '@/features/mode-one/services/tagSynonyms.ts';
import SearchIcon from '@mui/icons-material/Search';
import Box from '@mui/material/Box';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import InputAdornment from '@mui/material/InputAdornment';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { alpha } from '@mui/material/styles';
import { useCallback, useEffect, useMemo, useState } from 'react';

// Simple fuzzy match scoring
const fuzzyMatch = (query: string, text: string): number => {
    const queryLower = query.toLowerCase();
    const textLower = text.toLowerCase();

    if (textLower === queryLower) return 1000;
    if (textLower.startsWith(queryLower)) return 500;
    if (textLower.includes(queryLower)) return 100;

    // Fuzzy character matching
    let queryIndex = 0;
    let matches = 0;
    let consecutiveMatches = 0;
    let maxConsecutive = 0;

    for (let i = 0; i < textLower.length && queryIndex < queryLower.length; i++) {
        if (textLower[i] === queryLower[queryIndex]) {
            matches++;
            consecutiveMatches++;
            maxConsecutive = Math.max(maxConsecutive, consecutiveMatches);
            queryIndex++;
        } else {
            consecutiveMatches = 0;
        }
    }

    if (queryIndex === queryLower.length) {
        // All characters matched
        return 50 + (matches * 10) + (maxConsecutive * 5);
    }

    return 0;
};

type TagSynonymSelectorProps = {
    open: boolean;
    onClose: () => void;
    initialQuery: string;
    availableSourceKeys: ModeOneSourceKey[];
    onSelect: (suggestion: TagSuggestion) => void;
};

export const TagSynonymSelector = ({
    open,
    onClose,
    initialQuery,
    availableSourceKeys,
    onSelect,
}: TagSynonymSelectorProps) => {
    const [searchQuery, setSearchQuery] = useState(initialQuery);
    const [selectedIndex, setSelectedIndex] = useState(0);

    useEffect(() => {
        setSearchQuery(initialQuery);
        setSelectedIndex(0);
    }, [initialQuery, open]);

    // Ensure tag synonyms are loaded when dialog opens
    useEffect(() => {
        if (open) {
            void initializeTagSynonyms().catch(() => {
                // Ignore errors, will fall back gracefully
            });
        }
    }, [open]);

    // Get all tag suggestions for the query
    const [allSuggestions, setAllSuggestions] = useState<TagSuggestion[]>([]);
    
    useEffect(() => {
        if (!searchQuery.trim()) {
            setAllSuggestions([]);
            return;
        }
        let cancelled = false;
        getTagSuggestions(searchQuery, availableSourceKeys, 100).then((suggestions) => {
            if (!cancelled) {
                setAllSuggestions(suggestions);
            }
        }).catch(() => {
            if (!cancelled) {
                setAllSuggestions([]);
            }
        });
        return () => {
            cancelled = true;
        };
    }, [searchQuery, availableSourceKeys]);

    // Get synonyms for the query to show aliases
    const querySynonyms = useMemo(() => {
        if (!searchQuery.trim()) {
            return [];
        }
        const synonyms = getTagSynonyms(searchQuery);
        return synonyms.filter((syn) => syn.toLowerCase() !== searchQuery.toLowerCase());
    }, [searchQuery]);

    // Combine suggestions with synonyms and apply fuzzy search
    type FilteredResult = {
        label: string;
        aliases: string[];
        synonyms: string[];
        source: TagSuggestion | null;
        score: number;
    };

    const filteredResults = useMemo((): FilteredResult[] => {
        if (!searchQuery.trim()) {
            // Return suggestions as FilteredResult format
            return allSuggestions.slice(0, 20).map((suggestion) => ({
                label: suggestion.label,
                aliases: suggestion.aliases,
                synonyms: [],
                source: suggestion,
                score: suggestion.confidence,
            }));
        }

        // Create a map of all unique tags (from suggestions and synonyms)
        const tagMap = new Map<string, FilteredResult>();

        // Add suggestions
        allSuggestions.forEach((suggestion) => {
            const key = suggestion.canonical.toLowerCase();
            if (!tagMap.has(key)) {
                tagMap.set(key, {
                    label: suggestion.label,
                    aliases: suggestion.aliases,
                    synonyms: [],
                    source: suggestion,
                    score: 0,
                });
            }
            const entry = tagMap.get(key)!;
            entry.aliases = [...new Set([...entry.aliases, ...suggestion.aliases])];
        });

        // Add query synonyms
        querySynonyms.forEach((synonym) => {
            const synonyms = getTagSynonyms(synonym);
            const key = synonym.toLowerCase();
            if (!tagMap.has(key)) {
                tagMap.set(key, {
                    label: synonym,
                    aliases: [synonym],
                    synonyms: synonyms,
                    source: null,
                    score: 0,
                });
            } else {
                const entry = tagMap.get(key)!;
                entry.synonyms = synonyms;
            }
        });

        // Apply fuzzy search scoring
        const results = Array.from(tagMap.values()).map((entry) => {
            let maxScore = 0;

            // Score based on label match
            maxScore = Math.max(maxScore, fuzzyMatch(searchQuery, entry.label));

            // Score based on alias matches
            entry.aliases.forEach((alias) => {
                maxScore = Math.max(maxScore, fuzzyMatch(searchQuery, alias) * 0.8);
            });

            // Score based on synonym matches
            entry.synonyms.forEach((syn) => {
                maxScore = Math.max(maxScore, fuzzyMatch(searchQuery, syn) * 0.6);
            });

            return {
                ...entry,
                score: maxScore,
            };
        });

        // Sort by score and return top results
        return results
            .filter((r) => r.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, 50);
    }, [searchQuery, allSuggestions, querySynonyms]);

    const handleSelect = useCallback(
        (result: FilteredResult) => {
            if (result.source) {
                // Use the suggestion if available
                const suggestion = result.source;
                // Lazy load coverage if needed
                if (!suggestion.coverage) {
                    suggestion.coverage = getTagSuggestionCoverage(suggestion.canonical);
                }
                onSelect(suggestion);
            } else {
                // Create a minimal suggestion from the synonym
                const suggestion: TagSuggestion = {
                    canonical: result.label,
                    label: result.label,
                    match: result.label,
                    aliases: result.aliases,
                    categories: [],
                    support: [],
                    confidence: result.score,
                };
                onSelect(suggestion);
            }
            onClose();
        },
        [onSelect, onClose],
    );

    const handleKeyDown = useCallback(
        (event: React.KeyboardEvent) => {
            if (event.key === 'ArrowDown') {
                event.preventDefault();
                setSelectedIndex((prev) => Math.min(prev + 1, filteredResults.length - 1));
            } else if (event.key === 'ArrowUp') {
                event.preventDefault();
                setSelectedIndex((prev) => Math.max(prev - 1, 0));
            } else if (event.key === 'Enter') {
                event.preventDefault();
                if (filteredResults[selectedIndex]) {
                    handleSelect(filteredResults[selectedIndex]);
                }
            } else if (event.key === 'Escape') {
                event.preventDefault();
                onClose();
            }
        },
        [filteredResults, selectedIndex, handleSelect, onClose],
    );

    return (
        <Dialog
            open={open}
            onClose={onClose}
            maxWidth="sm"
            fullWidth
            PaperProps={{
                sx: {
                    backgroundColor: '#121212',
                    backgroundImage: 'none',
                    border: `2px solid ${alpha('#ea4c89', 0.3)}`,
                    boxShadow: `0 8px 32px ${alpha('#ea4c89', 0.2)}`,
                },
            }}
        >
            <DialogTitle
                sx={{
                    pb: 2,
                    backgroundColor: '#1a1a1a',
                    borderBottom: `1px solid ${alpha('#ea4c89', 0.2)}`,
                }}
            >
                <Stack spacing={1}>
                    <Typography variant="h6" sx={{ color: '#ea4c89', fontWeight: 600 }}>
                        Tag Synonyms & Aliases
                    </Typography>
                    <Typography variant="caption" sx={{ color: alpha('#fff', 0.6) }}>
                        Search and select from tag aliases and synonyms
                    </Typography>
                </Stack>
            </DialogTitle>
            <DialogContent sx={{ backgroundColor: '#121212', p: 0 }}>
                <Box sx={{ p: 2, pb: 1 }}>
                    <TextField
                        fullWidth
                        value={searchQuery}
                        onChange={(e) => {
                            setSearchQuery(e.target.value);
                            setSelectedIndex(0);
                        }}
                        onKeyDown={handleKeyDown}
                        placeholder="Search tags, aliases, or synonyms..."
                        variant="outlined"
                        autoFocus
                        InputProps={{
                            startAdornment: (
                                <InputAdornment position="start">
                                    <SearchIcon sx={{ color: alpha('#ea4c89', 0.7) }} />
                                </InputAdornment>
                            ),
                        }}
                        sx={{
                            '& .MuiOutlinedInput-root': {
                                backgroundColor: '#1a1a1a',
                                color: '#fff',
                                '& fieldset': {
                                    borderColor: alpha('#ea4c89', 0.3),
                                },
                                '&:hover fieldset': {
                                    borderColor: alpha('#ea4c89', 0.5),
                                },
                                '&.Mui-focused fieldset': {
                                    borderColor: '#ea4c89',
                                },
                            },
                        }}
                    />
                </Box>
                <Box sx={{ maxHeight: 400, overflow: 'auto' }}>
                    {filteredResults.length === 0 ? (
                        <Box sx={{ p: 3, textAlign: 'center' }}>
                            <Typography variant="body2" sx={{ color: alpha('#fff', 0.6) }}>
                                No tags found. Try a different search term.
                            </Typography>
                        </Box>
                    ) : (
                        <List sx={{ p: 0 }}>
                            {filteredResults.map((result, index) => {
                                const isSelected = index === selectedIndex;
                                const suggestion = result.source;
                                const allAliases = [...result.aliases, ...result.synonyms].filter(
                                    (a, i, arr) => arr.indexOf(a) === i && a.toLowerCase() !== result.label.toLowerCase(),
                                );

                                return (
                                    <ListItem
                                        key={result.label}
                                        disablePadding
                                        sx={{
                                            backgroundColor: isSelected ? alpha('#ea4c89', 0.15) : 'transparent',
                                            '&:hover': {
                                                backgroundColor: alpha('#ea4c89', 0.1),
                                            },
                                        }}
                                    >
                                        <ListItemButton
                                            onClick={() => handleSelect(result)}
                                            sx={{
                                                py: 1.5,
                                                px: 2,
                                            }}
                                        >
                                            <ListItemText
                                                primary={
                                                    <Typography
                                                        variant="body1"
                                                        sx={{
                                                            color: '#fff',
                                                            fontWeight: isSelected ? 600 : 400,
                                                        }}
                                                    >
                                                        {result.label}
                                                    </Typography>
                                                }
                                                secondary={
                                                    <Stack spacing={0.5} sx={{ mt: 0.5 }}>
                                                        {suggestion && suggestion.support && suggestion.support.length > 0 && (
                                                            <Typography
                                                                variant="caption"
                                                                sx={{ color: alpha('#ea4c89', 0.8) }}
                                                            >
                                                                Available on:{' '}
                                                                {suggestion.support
                                                                    .map((s: ModeOneSourceKey) => MODE_ONE_SOURCE_LABELS[s])
                                                                    .join(', ')}
                                                            </Typography>
                                                        )}
                                                        {allAliases.length > 0 && (
                                                            <Typography
                                                                variant="caption"
                                                                sx={{ color: alpha('#fff', 0.6) }}
                                                            >
                                                                Aliases: {allAliases.slice(0, 5).join(', ')}
                                                                {allAliases.length > 5 && ` +${allAliases.length - 5} more`}
                                                            </Typography>
                                                        )}
                                                        {suggestion && suggestion.recommended && suggestion.recommended.length > 0 && (
                                                            <Typography
                                                                variant="caption"
                                                                sx={{ color: alpha('#4caf50', 0.8) }}
                                                            >
                                                                Recommended: {suggestion.recommended.slice(0, 5).join(', ')}
                                                                {suggestion.recommended.length > 5 && ` +${suggestion.recommended.length - 5} more`}
                                                            </Typography>
                                                        )}
                                                        {suggestion && suggestion.related && suggestion.related.length > 0 && (
                                                            <Typography
                                                                variant="caption"
                                                                sx={{ color: alpha('#ff9800', 0.8) }}
                                                            >
                                                                Related: {suggestion.related.slice(0, 5).join(', ')}
                                                                {suggestion.related.length > 5 && ` +${suggestion.related.length - 5} more`}
                                                            </Typography>
                                                        )}
                                                    </Stack>
                                                }
                                            />
                                        </ListItemButton>
                                    </ListItem>
                                );
                            })}
                        </List>
                    )}
                </Box>
                <Box sx={{ p: 2, pt: 1, borderTop: `1px solid ${alpha('#ea4c89', 0.1)}` }}>
                    <Typography variant="caption" sx={{ color: alpha('#fff', 0.5) }}>
                        Use ↑↓ to navigate, Enter to select, Esc to close
                    </Typography>
                </Box>
            </DialogContent>
        </Dialog>
    );
};

