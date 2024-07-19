/*
 Navicat Premium Data Transfer

 Source Server         : 阿里云数据库
 Source Server Type    : MySQL
 Source Server Version : 50744
 Source Host           : 39.102.209.149:3306
 Source Schema         : i8

 Target Server Type    : MySQL
 Target Server Version : 50744
 File Encoding         : 65001

 Date: 19/07/2024 17:40:38
*/

SET NAMES utf8mb4;
SET
FOREIGN_KEY_CHECKS = 0;

-- ----------------------------
-- Table structure for email_confirmations
-- ----------------------------
DROP TABLE IF EXISTS `email_confirmations`;
CREATE TABLE `email_confirmations`
(
    `id`                int(11) NOT NULL AUTO_INCREMENT,
    `email`             varchar(255) CHARACTER SET utf8 COLLATE utf8_bin NOT NULL,
    `confirmation_code` varchar(255) CHARACTER SET utf8 COLLATE utf8_bin NOT NULL,
    `created_at`        timestamp                                        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 28 CHARACTER SET = utf8 COLLATE = utf8_bin ROW_FORMAT = Dynamic;

-- ----------------------------
-- Table structure for files
-- ----------------------------
DROP TABLE IF EXISTS `files`;
CREATE TABLE `files`
(
    `id`              int(11) NOT NULL AUTO_INCREMENT,
    `project_id`      int(11) NOT NULL,
    `user_id`         int(11) NOT NULL,
    `filename`        varchar(255) CHARACTER SET utf8 COLLATE utf8_bin NOT NULL,
    `filepath`        varchar(255) CHARACTER SET utf8 COLLATE utf8_bin NOT NULL,
    `file_size`       bigint(20) NOT NULL,
    `uploaded_at`     timestamp                                        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `first_chunk_md5` varchar(32) CHARACTER SET utf8 COLLATE utf8_bin NULL DEFAULT NULL,
    PRIMARY KEY (`id`) USING BTREE,
    INDEX             `project_id`(`project_id`) USING BTREE,
    INDEX             `user_id`(`user_id`) USING BTREE,
    CONSTRAINT `files_ibfk_1` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT `files_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE = InnoDB AUTO_INCREMENT = 32 CHARACTER SET = utf8 COLLATE = utf8_bin ROW_FORMAT = Dynamic;

-- ----------------------------
-- Table structure for project_invitations
-- ----------------------------
DROP TABLE IF EXISTS `project_invitations`;
CREATE TABLE `project_invitations`
(
    `id`         int(11) NOT NULL AUTO_INCREMENT,
    `project_id` int(11) NOT NULL,
    `email`      varchar(255) CHARACTER SET utf8 COLLATE utf8_bin NOT NULL,
    `token`      varchar(255) CHARACTER SET utf8 COLLATE utf8_bin NOT NULL,
    `created_at` timestamp                                        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`) USING BTREE,
    INDEX        `project_id`(`project_id`) USING BTREE,
    CONSTRAINT `project_invitations_ibfk_1` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE = InnoDB AUTO_INCREMENT = 24 CHARACTER SET = utf8 COLLATE = utf8_bin ROW_FORMAT = Dynamic;

-- ----------------------------
-- Table structure for project_members
-- ----------------------------
DROP TABLE IF EXISTS `project_members`;
CREATE TABLE `project_members`
(
    `project_id` int(11) NOT NULL,
    `user_id`    int(11) NOT NULL,
    `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `role`       enum('admin','member') CHARACTER SET utf8 COLLATE utf8_bin NULL DEFAULT 'member',
    PRIMARY KEY (`project_id`, `user_id`) USING BTREE,
    INDEX        `user_id`(`user_id`) USING BTREE,
    CONSTRAINT `project_members_ibfk_1` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT `project_members_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE = InnoDB CHARACTER SET = utf8 COLLATE = utf8_bin ROW_FORMAT = Dynamic;

-- ----------------------------
-- Table structure for projects
-- ----------------------------
DROP TABLE IF EXISTS `projects`;
CREATE TABLE `projects`
(
    `id`          int(11) NOT NULL AUTO_INCREMENT,
    `name`        varchar(255) CHARACTER SET utf8 COLLATE utf8_bin NOT NULL,
    `description` text CHARACTER SET utf8 COLLATE utf8_bin NULL,
    `members`     text CHARACTER SET utf8 COLLATE utf8_bin NULL,
    `created_at`  timestamp                                        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `created_by`  int(11) NULL DEFAULT NULL,
    `avatar`      varchar(255) CHARACTER SET utf8 COLLATE utf8_bin NULL DEFAULT NULL,
    PRIMARY KEY (`id`) USING BTREE,
    INDEX         `created_by`(`created_by`) USING BTREE,
    CONSTRAINT `projects_ibfk_1` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE = InnoDB AUTO_INCREMENT = 2 CHARACTER SET = utf8 COLLATE = utf8_bin ROW_FORMAT = Dynamic;

-- ----------------------------
-- Table structure for refresh_tokens
-- ----------------------------
DROP TABLE IF EXISTS `refresh_tokens`;
CREATE TABLE `refresh_tokens`
(
    `id`         int(11) NOT NULL AUTO_INCREMENT,
    `token`      varchar(512) CHARACTER SET utf8 COLLATE utf8_bin NOT NULL,
    `user_id`    int(11) NOT NULL,
    `expires_at` datetime                                         NOT NULL,
    `is_revoked` tinyint(1) NULL DEFAULT 0,
    `created_at` timestamp                                        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`) USING BTREE,
    INDEX        `user_id`(`user_id`) USING BTREE,
    CONSTRAINT `refresh_tokens_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE = InnoDB AUTO_INCREMENT = 7 CHARACTER SET = utf8 COLLATE = utf8_bin ROW_FORMAT = Dynamic;

-- ----------------------------
-- Table structure for users
-- ----------------------------
DROP TABLE IF EXISTS `users`;
CREATE TABLE `users`
(
    `id`                int(11) NOT NULL AUTO_INCREMENT,
    `username`          varchar(255) CHARACTER SET utf8 COLLATE utf8_bin NOT NULL,
    `password`          varchar(255) CHARACTER SET utf8 COLLATE utf8_bin NOT NULL,
    `name`              varchar(255) CHARACTER SET utf8 COLLATE utf8_bin NOT NULL,
    `email`             varchar(255) CHARACTER SET utf8 COLLATE utf8_bin NOT NULL,
    `role`              int(11) NOT NULL DEFAULT 1,
    `confirmation_code` varchar(255) CHARACTER SET utf8 COLLATE utf8_bin NULL DEFAULT NULL,
    `email_confirmed`   tinyint(1) NULL DEFAULT 0,
    `avatar`            varchar(255) CHARACTER SET utf8 COLLATE utf8_bin NULL DEFAULT NULL,
    PRIMARY KEY (`id`) USING BTREE,
    UNIQUE INDEX `username`(`username`) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 9 CHARACTER SET = utf8 COLLATE = utf8_bin ROW_FORMAT = Dynamic;

SET
FOREIGN_KEY_CHECKS = 1;
