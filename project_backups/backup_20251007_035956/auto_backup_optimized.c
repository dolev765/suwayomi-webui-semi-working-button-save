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
#include <fcntl.h>
#include <sys/mman.h>

#define MAX_PATH 4096
#define BACKUP_BASE_DIR "project_backups"
#define CHUNK_SIZE (1024 * 1024)  // 1MB chunks for memory efficiency
#define MIN_FILE_SIZE_FOR_MMAP (1024 * 1024 * 10)  // 10MB threshold

// Directories and files to exclude from backup
const char* exclude_patterns[] = {
    "node_modules", "project_backups", ".git", "buildZip", ".cache",
    "dist", "build", ".vscode", ".idea", "*.tmp", "*.log",
    "__pycache__", ".pytest_cache", "Suwayomi-Server", 
    "manga-image-translator", "*.pyc", ".DS_Store",
    NULL
};

// Global counters for statistics
static size_t total_files = 0;
static size_t total_dirs = 0;
static size_t total_bytes = 0;
static size_t skipped_files = 0;

// Function prototypes
int should_exclude(const char* name);
int create_directory(const char* path);
int copy_file_optimized(const char* src, const char* dst);
int copy_file_mmap(const char* src, const char* dst, size_t file_size);
int copy_file_chunked(const char* src, const char* dst);
int copy_directory_recursive(const char* src_base, const char* dst_base, const char* rel_path);
void get_timestamp(char* buffer, size_t size);
int daemonize(void);
void print_usage(const char* prog_name);

int should_exclude(const char* name) {
    for (int i = 0; exclude_patterns[i] != NULL; i++) {
        if (strcmp(name, exclude_patterns[i]) == 0) {
            return 1;
        }
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
        return S_ISDIR(st.st_mode) ? 0 : -1;
    }
    if (mkdir(path, 0755) != 0 && errno != EEXIST) {
        return -1;
    }
    return 0;
}

// Memory-mapped copy for large files
int copy_file_mmap(const char* src, const char* dst, size_t file_size) {
    int src_fd = open(src, O_RDONLY);
    if (src_fd < 0) return -1;
    
    int dst_fd = open(dst, O_WRONLY | O_CREAT | O_TRUNC, 0644);
    if (dst_fd < 0) {
        close(src_fd);
        return -1;
    }
    
    // Set destination file size
    if (ftruncate(dst_fd, file_size) != 0) {
        close(src_fd);
        close(dst_fd);
        return -1;
    }
    
    // Map source file
    void* src_map = mmap(NULL, file_size, PROT_READ, MAP_PRIVATE, src_fd, 0);
    if (src_map == MAP_FAILED) {
        close(src_fd);
        close(dst_fd);
        return -1;
    }
    
    // Map destination file
    void* dst_map = mmap(NULL, file_size, PROT_WRITE, MAP_SHARED, dst_fd, 0);
    if (dst_map == MAP_FAILED) {
        munmap(src_map, file_size);
        close(src_fd);
        close(dst_fd);
        return -1;
    }
    
    // Copy data
    memcpy(dst_map, src_map, file_size);
    
    // Cleanup
    munmap(src_map, file_size);
    munmap(dst_map, file_size);
    close(src_fd);
    close(dst_fd);
    
    return 0;
}

// Chunked copy for memory efficiency
int copy_file_chunked(const char* src, const char* dst) {
    int src_fd = open(src, O_RDONLY);
    if (src_fd < 0) return -1;
    
    int dst_fd = open(dst, O_WRONLY | O_CREAT | O_TRUNC, 0644);
    if (dst_fd < 0) {
        close(src_fd);
        return -1;
    }
    
    // Use stack buffer for small chunks
    char buffer[CHUNK_SIZE];
    ssize_t bytes_read, bytes_written;
    
    while ((bytes_read = read(src_fd, buffer, sizeof(buffer))) > 0) {
        bytes_written = write(dst_fd, buffer, bytes_read);
        if (bytes_written != bytes_read) {
            close(src_fd);
            close(dst_fd);
            return -1;
        }
    }
    
    close(src_fd);
    close(dst_fd);
    
    return (bytes_read < 0) ? -1 : 0;
}

// Optimized file copy with smart selection
int copy_file_optimized(const char* src, const char* dst) {
    struct stat st;
    if (stat(src, &st) != 0) {
        return -1;
    }
    
    total_bytes += st.st_size;
    
    // Choose copy method based on file size
    int result;
    if (st.st_size >= MIN_FILE_SIZE_FOR_MMAP) {
        // Use mmap for large files (faster, but uses virtual memory)
        result = copy_file_mmap(src, dst, st.st_size);
    } else {
        // Use chunked copy for smaller files (more memory efficient)
        result = copy_file_chunked(src, dst);
    }
    
    if (result == 0) {
        // Preserve permissions
        chmod(dst, st.st_mode);
        total_files++;
    }
    
    return result;
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
    if (!dir) return -1;
    
    struct dirent* entry;
    
    while ((entry = readdir(dir)) != NULL) {
        if (strcmp(entry->d_name, ".") == 0 || strcmp(entry->d_name, "..") == 0) {
            continue;
        }
        
        if (should_exclude(entry->d_name)) {
            skipped_files++;
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
            continue;
        }
        
        if (S_ISDIR(st.st_mode)) {
            if (create_directory(item_dst) == 0) {
                total_dirs++;
                copy_directory_recursive(src_base, dst_base, new_rel_path);
            }
        } else if (S_ISREG(st.st_mode)) {
            copy_file_optimized(item_src, item_dst);
        } else if (S_ISLNK(st.st_mode)) {
            char link_target[MAX_PATH];
            ssize_t len = readlink(item_src, link_target, sizeof(link_target) - 1);
            if (len != -1) {
                link_target[len] = '\0';
                symlink(link_target, item_dst);
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

// Daemonize the process
int daemonize(void) {
    pid_t pid = fork();
    
    if (pid < 0) {
        return -1;  // Fork failed
    }
    
    if (pid > 0) {
        exit(0);  // Parent exits
    }
    
    // Child continues
    if (setsid() < 0) {
        return -1;
    }
    
    // Fork again to prevent acquiring a controlling terminal
    pid = fork();
    if (pid < 0) {
        return -1;
    }
    if (pid > 0) {
        exit(0);
    }
    
    // Close standard file descriptors
    close(STDIN_FILENO);
    close(STDOUT_FILENO);
    close(STDERR_FILENO);
    
    // Open /dev/null
    int fd = open("/dev/null", O_RDWR);
    if (fd != -1) {
        dup2(fd, STDIN_FILENO);
        dup2(fd, STDOUT_FILENO);
        dup2(fd, STDERR_FILENO);
        if (fd > 2) {
            close(fd);
        }
    }
    
    return 0;
}

void print_usage(const char* prog_name) {
    printf("Usage: %s [options]\n", prog_name);
    printf("Options:\n");
    printf("  -h, --help       Show this help message\n");
    printf("  -d, --dir DIR    Specify backup base directory (default: %s)\n", BACKUP_BASE_DIR);
    printf("  -m, --message    Add a description message to the backup\n");
    printf("  -q, --quiet      Quiet mode (minimal output)\n");
    printf("  -s, --silent     Silent mode (no output, for daemon use)\n");
}

int main(int argc, char* argv[]) {
    char timestamp[64];
    char backup_dir[MAX_PATH];
    char backup_base[MAX_PATH];
    char cwd[MAX_PATH];
    char message[256] = "";
    int quiet = 0;
    int silent = 0;
    
    strcpy(backup_base, BACKUP_BASE_DIR);
    
    for (int i = 1; i < argc; i++) {
        if (strcmp(argv[i], "-h") == 0 || strcmp(argv[i], "--help") == 0) {
            print_usage(argv[0]);
            return 0;
        } else if (strcmp(argv[i], "-d") == 0 || strcmp(argv[i], "--dir") == 0) {
            if (i + 1 < argc) {
                strncpy(backup_base, argv[++i], sizeof(backup_base) - 1);
            }
        } else if (strcmp(argv[i], "-m") == 0 || strcmp(argv[i], "--message") == 0) {
            if (i + 1 < argc) {
                strncpy(message, argv[++i], sizeof(message) - 1);
            }
        } else if (strcmp(argv[i], "-q") == 0 || strcmp(argv[i], "--quiet") == 0) {
            quiet = 1;
        } else if (strcmp(argv[i], "-s") == 0 || strcmp(argv[i], "--silent") == 0) {
            silent = 1;
        }
    }
    
    if (getcwd(cwd, sizeof(cwd)) == NULL) {
        return 1;
    }
    
    get_timestamp(timestamp, sizeof(timestamp));
    
    if (create_directory(backup_base) != 0) {
        return 1;
    }
    
    snprintf(backup_dir, sizeof(backup_dir), "%s/backup_%s", backup_base, timestamp);
    if (create_directory(backup_dir) != 0) {
        return 1;
    }
    
    if (!silent) {
        if (!quiet) {
            printf("\n=== PROJECT AUTO-BACKUP (Optimized) ===\n");
            printf("Source:      %s\n", cwd);
            printf("Destination: %s\n", backup_dir);
            printf("Timestamp:   %s\n\n", timestamp);
        } else {
            printf("Backing up to %s...\n", backup_dir);
        }
    }
    
    // Reset counters
    total_files = 0;
    total_dirs = 0;
    total_bytes = 0;
    skipped_files = 0;
    
    // Perform backup
    copy_directory_recursive(cwd, backup_dir, "");
    
    // Create metadata file
    char metadata_path[MAX_PATH];
    snprintf(metadata_path, sizeof(metadata_path), "%s/backup_info.txt", backup_dir);
    FILE* meta_file = fopen(metadata_path, "w");
    if (meta_file) {
        fprintf(meta_file, "Backup Information\n");
        fprintf(meta_file, "==================\n\n");
        fprintf(meta_file, "Timestamp: %s\n", timestamp);
        fprintf(meta_file, "Source: %s\n", cwd);
        if (strlen(message) > 0) {
            fprintf(meta_file, "Message: %s\n", message);
        }
        fprintf(meta_file, "\nStatistics:\n");
        fprintf(meta_file, "  Files copied: %zu\n", total_files);
        fprintf(meta_file, "  Directories: %zu\n", total_dirs);
        fprintf(meta_file, "  Total size: %.2f MB\n", total_bytes / (1024.0 * 1024.0));
        fprintf(meta_file, "  Items skipped: %zu\n", skipped_files);
        fclose(meta_file);
    }
    
    if (!silent) {
        if (!quiet) {
            printf("\n=== BACKUP COMPLETE ===\n");
            printf("Files: %zu | Dirs: %zu | Size: %.2f MB | Skipped: %zu\n\n",
                   total_files, total_dirs, total_bytes / (1024.0 * 1024.0), skipped_files);
        } else {
            printf("✓ Complete: %zu files, %.2f MB\n", 
                   total_files, total_bytes / (1024.0 * 1024.0));
        }
    }
    
    return 0;
}

