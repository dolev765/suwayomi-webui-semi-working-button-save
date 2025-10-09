#define _XOPEN_SOURCE 700
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#include <sys/stat.h>
#include <sys/types.h>
#include <unistd.h>
#include <dirent.h>
#include <errno.h>
#include <libgen.h>
#include <limits.h>

#define MAX_PATH 4096
#define BACKUP_BASE_DIR "project_backups"

// Directories and files to exclude from backup
const char* exclude_patterns[] = {
    "node_modules",
    "project_backups",
    ".git",
    "buildZip",
    ".cache",
    "dist",
    "build",
    ".vscode",
    ".idea",
    "*.tmp",
    "*.log",
    "__pycache__",
    ".pytest_cache",
    NULL
};

// Function prototypes
int should_exclude(const char* name);
int create_directory(const char* path);
int copy_file(const char* src, const char* dst);
int copy_directory_recursive(const char* src_base, const char* dst_base, const char* rel_path);
void get_timestamp(char* buffer, size_t size);
void print_usage(const char* prog_name);

int should_exclude(const char* name) {
    for (int i = 0; exclude_patterns[i] != NULL; i++) {
        // Simple pattern matching for exact matches
        if (strcmp(name, exclude_patterns[i]) == 0) {
            return 1;
        }
        // Handle wildcard patterns like *.log
        if (exclude_patterns[i][0] == '*' && exclude_patterns[i][1] == '.') {
            const char* ext = exclude_patterns[i] + 1;
            size_t name_len = strlen(name);
            size_t ext_len = strlen(ext);
            if (name_len >= ext_len && 
                strcmp(name + name_len - ext_len, ext) == 0) {
                return 1;
            }
        }
    }
    return 0;
}

int create_directory(const char* path) {
    struct stat st;
    if (stat(path, &st) == 0) {
        if (S_ISDIR(st.st_mode)) {
            return 0; // Directory already exists
        } else {
            fprintf(stderr, "Error: '%s' exists but is not a directory\n", path);
            return -1;
        }
    }
    
    if (mkdir(path, 0755) != 0) {
        if (errno != EEXIST) {
            perror("mkdir");
            return -1;
        }
    }
    return 0;
}

int copy_file(const char* src, const char* dst) {
    FILE *src_file, *dst_file;
    char buffer[8192];
    size_t bytes;
    
    src_file = fopen(src, "rb");
    if (!src_file) {
        fprintf(stderr, "Warning: Cannot open source file '%s': %s\n", src, strerror(errno));
        return -1;
    }
    
    dst_file = fopen(dst, "wb");
    if (!dst_file) {
        fprintf(stderr, "Error: Cannot create destination file '%s': %s\n", dst, strerror(errno));
        fclose(src_file);
        return -1;
    }
    
    while ((bytes = fread(buffer, 1, sizeof(buffer), src_file)) > 0) {
        if (fwrite(buffer, 1, bytes, dst_file) != bytes) {
            fprintf(stderr, "Error: Failed to write to '%s'\n", dst);
            fclose(src_file);
            fclose(dst_file);
            return -1;
        }
    }
    
    fclose(src_file);
    fclose(dst_file);
    
    // Preserve file permissions
    struct stat st;
    if (stat(src, &st) == 0) {
        chmod(dst, st.st_mode);
    }
    
    return 0;
}

int copy_directory_recursive(const char* src_base, const char* dst_base, const char* rel_path) {
    char src_path[MAX_PATH];
    char dst_path[MAX_PATH];
    
    if (rel_path && strlen(rel_path) > 0) {
        snprintf(src_path, sizeof(src_path), "%s/%s", src_base, rel_path);
        snprintf(dst_path, sizeof(dst_path), "%s/%s", dst_base, rel_path);
    } else {
        strncpy(src_path, src_base, sizeof(src_path) - 1);
        strncpy(dst_path, dst_base, sizeof(dst_path) - 1);
    }
    
    DIR* dir = opendir(src_path);
    if (!dir) {
        fprintf(stderr, "Warning: Cannot open directory '%s': %s\n", src_path, strerror(errno));
        return -1;
    }
    
    struct dirent* entry;
    int file_count = 0, dir_count = 0;
    
    while ((entry = readdir(dir)) != NULL) {
        // Skip . and ..
        if (strcmp(entry->d_name, ".") == 0 || strcmp(entry->d_name, "..") == 0) {
            continue;
        }
        
        // Check if should exclude
        if (should_exclude(entry->d_name)) {
            printf("  Skipping: %s\n", entry->d_name);
            continue;
        }
        
        char item_src[MAX_PATH];
        char item_dst[MAX_PATH];
        char new_rel_path[MAX_PATH];
        
        snprintf(item_src, sizeof(item_src), "%s/%s", src_path, entry->d_name);
        snprintf(item_dst, sizeof(item_dst), "%s/%s", dst_path, entry->d_name);
        
        if (rel_path && strlen(rel_path) > 0) {
            snprintf(new_rel_path, sizeof(new_rel_path), "%s/%s", rel_path, entry->d_name);
        } else {
            snprintf(new_rel_path, sizeof(new_rel_path), "%s", entry->d_name);
        }
        
        struct stat st;
        if (lstat(item_src, &st) != 0) {
            fprintf(stderr, "Warning: Cannot stat '%s'\n", item_src);
            continue;
        }
        
        if (S_ISDIR(st.st_mode)) {
            // It's a directory
            if (create_directory(item_dst) == 0) {
                printf("  Dir:  %s/\n", new_rel_path);
                copy_directory_recursive(src_base, dst_base, new_rel_path);
                dir_count++;
            }
        } else if (S_ISREG(st.st_mode)) {
            // It's a regular file
            if (copy_file(item_src, item_dst) == 0) {
                printf("  File: %s\n", new_rel_path);
                file_count++;
            }
        } else if (S_ISLNK(st.st_mode)) {
            // It's a symbolic link
            char link_target[MAX_PATH];
            ssize_t len = readlink(item_src, link_target, sizeof(link_target) - 1);
            if (len != -1) {
                link_target[len] = '\0';
                if (symlink(link_target, item_dst) == 0) {
                    printf("  Link: %s -> %s\n", new_rel_path, link_target);
                }
            }
        }
    }
    
    closedir(dir);
    return 0;
}

void get_timestamp(char* buffer, size_t size) {
    time_t now = time(NULL);
    struct tm* t = localtime(&now);
    strftime(buffer, size, "%Y%m%d_%H%M%S", t);
}

void print_usage(const char* prog_name) {
    printf("Usage: %s [options]\n", prog_name);
    printf("Options:\n");
    printf("  -h, --help       Show this help message\n");
    printf("  -d, --dir DIR    Specify backup base directory (default: %s)\n", BACKUP_BASE_DIR);
    printf("  -m, --message    Add a description message to the backup\n");
    printf("\nThis program creates timestamped backups of your project.\n");
    printf("Excluded patterns: node_modules, .git, build directories, logs, etc.\n");
}

int main(int argc, char* argv[]) {
    char timestamp[64];
    char backup_dir[MAX_PATH];
    char backup_base[MAX_PATH];
    char cwd[MAX_PATH];
    char message[256] = "";
    
    // Parse command-line arguments
    strcpy(backup_base, BACKUP_BASE_DIR);
    
    for (int i = 1; i < argc; i++) {
        if (strcmp(argv[i], "-h") == 0 || strcmp(argv[i], "--help") == 0) {
            print_usage(argv[0]);
            return 0;
        } else if (strcmp(argv[i], "-d") == 0 || strcmp(argv[i], "--dir") == 0) {
            if (i + 1 < argc) {
                strncpy(backup_base, argv[++i], sizeof(backup_base) - 1);
            } else {
                fprintf(stderr, "Error: -d requires an argument\n");
                return 1;
            }
        } else if (strcmp(argv[i], "-m") == 0 || strcmp(argv[i], "--message") == 0) {
            if (i + 1 < argc) {
                strncpy(message, argv[++i], sizeof(message) - 1);
            } else {
                fprintf(stderr, "Error: -m requires an argument\n");
                return 1;
            }
        }
    }
    
    // Get current working directory
    if (getcwd(cwd, sizeof(cwd)) == NULL) {
        perror("getcwd");
        return 1;
    }
    
    // Get timestamp
    get_timestamp(timestamp, sizeof(timestamp));
    
    // Create backup base directory
    if (create_directory(backup_base) != 0) {
        fprintf(stderr, "Error: Failed to create backup base directory\n");
        return 1;
    }
    
    // Create timestamped backup directory
    snprintf(backup_dir, sizeof(backup_dir), "%s/backup_%s", backup_base, timestamp);
    if (create_directory(backup_dir) != 0) {
        fprintf(stderr, "Error: Failed to create backup directory '%s'\n", backup_dir);
        return 1;
    }
    
    printf("\n╔════════════════════════════════════════════════════════════╗\n");
    printf("║           PROJECT AUTO-BACKUP SYSTEM                       ║\n");
    printf("╚════════════════════════════════════════════════════════════╝\n\n");
    printf("Source:      %s\n", cwd);
    printf("Destination: %s\n", backup_dir);
    printf("Timestamp:   %s\n", timestamp);
    if (strlen(message) > 0) {
        printf("Message:     %s\n", message);
    }
    printf("\nStarting backup...\n\n");
    
    // Perform the backup
    int result = copy_directory_recursive(cwd, backup_dir, "");
    
    // Create a metadata file
    char metadata_path[MAX_PATH];
    snprintf(metadata_path, sizeof(metadata_path), "%s/backup_info.txt", backup_dir);
    FILE* meta_file = fopen(metadata_path, "w");
    if (meta_file) {
        fprintf(meta_file, "Backup Information\n");
        fprintf(meta_file, "==================\n\n");
        fprintf(meta_file, "Timestamp: %s\n", timestamp);
        fprintf(meta_file, "Source Directory: %s\n", cwd);
        fprintf(meta_file, "Backup Directory: %s\n", backup_dir);
        if (strlen(message) > 0) {
            fprintf(meta_file, "Message: %s\n", message);
        }
        fprintf(meta_file, "\nExcluded Patterns:\n");
        for (int i = 0; exclude_patterns[i] != NULL; i++) {
            fprintf(meta_file, "  - %s\n", exclude_patterns[i]);
        }
        fclose(meta_file);
    }
    
    if (result == 0) {
        printf("\n╔════════════════════════════════════════════════════════════╗\n");
        printf("║           BACKUP COMPLETED SUCCESSFULLY                    ║\n");
        printf("╚════════════════════════════════════════════════════════════╝\n\n");
        printf("Backup location: %s\n\n", backup_dir);
        return 0;
    } else {
        printf("\n⚠ Backup completed with some warnings.\n");
        printf("Backup location: %s\n\n", backup_dir);
        return 0;
    }
}

