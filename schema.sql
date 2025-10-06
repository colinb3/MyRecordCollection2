CREATE DATABASE mrc_db;
USE mrc_db;

CREATE TABLE User (
    uuid CHAR(36) PRIMARY KEY,
    username VARCHAR(32) UNIQUE NOT NULL,
    displayName VARCHAR(50) NOT NULL,
    password VARCHAR(255) NOT NULL,
    bio TINYTEXT DEFAULT NULL,
    profilePic VARCHAR(255) DEFAULT NULL,
    created DATE NOT NULL DEFAULT (CURRENT_DATE),
);

CREATE TABLE RecTable (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(50) NOT NULL,
    userUuid CHAR(36),
    FOREIGN KEY (userUuid) REFERENCES User(uuid) ON DELETE CASCADE
);

CREATE TABLE Record (
    id INT AUTO_INCREMENT PRIMARY KEY,
    added DATE NOT NULL,
    artist VARCHAR(255),
    cover VARCHAR(255),
    name VARCHAR(255) NOT NULL,
    rating TINYINT,
    release_year YEAR,
    userUuid CHAR(36),
    tableId INT,
    FOREIGN KEY (userUuid) REFERENCES User(uuid) ON DELETE CASCADE,
    FOREIGN KEY (tableId) REFERENCES RecTable(id) ON DELETE CASCADE
);

CREATE TABLE Tag (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(50) NOT NULL,
    userUuid CHAR(36),
    FOREIGN KEY (userUuid) REFERENCES User(uuid) ON DELETE CASCADE
);

CREATE TABLE Tagged (
    recordId INT,
    tagId INT,
    PRIMARY KEY (recordId, tagId),
    FOREIGN KEY (recordId) REFERENCES Record(id) ON DELETE CASCADE,
    FOREIGN KEY (tagId) REFERENCES Tag(id) ON DELETE CASCADE
);

CREATE TABLE UserSettings (
    userUuid CHAR(36) PRIMARY KEY,
    recordTablePrefs JSON NOT NULL,
    profileHighlights JSON,
    FOREIGN KEY (userUuid) REFERENCES User(uuid) ON DELETE CASCADE
);

CREATE TABLE Follows (
    userUuid CHAR(36) NOT NULL,
    followsUuid CHAR(36) NOT NULL,
    PRIMARY KEY (userUuid, followsUuid),
    FOREIGN KEY (userUuid) REFERENCES User(uuid) ON DELETE CASCADE,
    FOREIGN KEY (followsUuid) REFERENCES User(uuid) ON DELETE CASCADE
);

CREATE INDEX idx_follows_followed ON Follows (followsUuid);
