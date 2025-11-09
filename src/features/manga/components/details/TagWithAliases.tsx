/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { SearchLink } from '@/features/manga/components/details/SearchLink.tsx';
import { ensureDatabaseReady, resolveAliasSync } from '@/features/mode-one/services/tagDatabaseSQL.ts';
import Chip from '@mui/material/Chip';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import { useCallback, useEffect, useState } from 'react';

interface TagWithAliasesProps {
    tag: string;
    sourceId?: string | null;
    mode: 'default' | 'source' | 'migrate.search' | 'migrate.select' | 'duplicate' | 'source.global-search';
    userSearchTerm?: string; // The alias the user searched for (e.g., "boob job")
}

export const TagWithAliases = ({ tag, sourceId, mode, userSearchTerm }: TagWithAliasesProps) => {
    const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
    const [aliases, setAliases] = useState<string[]>([]);
    const [canonical, setCanonical] = useState<string>(tag);
    const [loading, setLoading] = useState(false);
    const open = Boolean(anchorEl);

    // Resolve the tag to canonical
    useEffect(() => {
        // If this is the user's search term (alias), resolve it to canonical
        const isUserSearchTerm = userSearchTerm && tag.toLowerCase() === userSearchTerm.toLowerCase();
        let resolvedCanonical = tag;

        if (isUserSearchTerm) {
            // Resolve alias to canonical
            resolvedCanonical = resolveAliasSync(tag) || tag;
        } else {
            // Check if the tag itself is an alias
            const resolved = resolveAliasSync(tag);
            if (resolved) {
                resolvedCanonical = resolved;
            }
        }

        setCanonical(resolvedCanonical);
        // Initialize with just the canonical - aliases will be loaded on click
        setAliases([resolvedCanonical]);
    }, [tag, userSearchTerm]);

    const loadAliasesAndShowMenu = useCallback(async (event: React.MouseEvent<HTMLElement>) => {
        if (loading) return;

        setLoading(true);
        try {
            await ensureDatabaseReady();
            const { getAllTagsByCategory } = await import('@/features/mode-one/services/tagDatabaseSQL.ts');

            const maleTags = getAllTagsByCategory('male');
            const femaleTags = getAllTagsByCategory('female');
            const allTags = [...maleTags, ...femaleTags];

            const tagData = allTags.find(t =>
                t.canonical.toLowerCase() === canonical.toLowerCase()
            );

            if (tagData && tagData.aliases.length > 0) {
                const allAliases = [tagData.canonical, ...tagData.aliases]
                    .filter((a, i, arr) => arr.findIndex(b => b.toLowerCase() === a.toLowerCase()) === i);
                setAliases(allAliases);
                setAnchorEl(event.currentTarget);
            } else {
                setAliases([canonical]);
            }
        } catch (error) {
            console.error('Error loading aliases:', error);
            setAliases([canonical]);
        } finally {
            setLoading(false);
        }
    }, [canonical, loading]);

    const handleClick = useCallback((event: React.MouseEvent<HTMLElement>) => {
        // Only show dropdown on Ctrl/Cmd+click
        // Regular click should navigate (let SearchLink handle it)
        if (event.ctrlKey || event.metaKey) {
            event.preventDefault();
            event.stopPropagation();
            loadAliasesAndShowMenu(event);
        }
        // Otherwise, let the click bubble up to SearchLink for navigation
    }, [loadAliasesAndShowMenu]);

    const handleContextMenu = useCallback((event: React.MouseEvent<HTMLElement>) => {
        // Show dropdown on right-click
        event.preventDefault();
        event.stopPropagation();
        loadAliasesAndShowMenu(event);
    }, [loadAliasesAndShowMenu]);

    const handleClose = useCallback(() => {
        setAnchorEl(null);
    }, []);

    // Display the user's search term if it's an alias, otherwise display the tag
    const displayTag = userSearchTerm && tag.toLowerCase() === userSearchTerm.toLowerCase()
        ? userSearchTerm
        : tag;

    return (
        <>
            <SearchLink query={canonical} sourceId={sourceId} mode={mode}>
                <Chip
                    label={displayTag}
                    variant="outlined"
                    onClick={handleClick}
                    onContextMenu={handleContextMenu}
                    sx={{
                        cursor: 'pointer',
                    }}
                />
            </SearchLink>
            {aliases.length > 1 && (
                <Menu
                    anchorEl={anchorEl}
                    open={open}
                    onClose={handleClose}
                    anchorOrigin={{
                        vertical: 'bottom',
                        horizontal: 'left',
                    }}
                    transformOrigin={{
                        vertical: 'top',
                        horizontal: 'left',
                    }}
                >
                    {aliases.map((alias) => (
                        <MenuItem
                            key={alias}
                            onClick={handleClose}
                            selected={alias.toLowerCase() === displayTag.toLowerCase()}
                        >
                            <SearchLink query={canonical} sourceId={sourceId} mode={mode}>
                                <ListItemText primary={alias} />
                            </SearchLink>
                        </MenuItem>
                    ))}
                </Menu>
            )}
        </>
    );
};

