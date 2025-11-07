CREATE DATABASE mrc_db;
USE mrc_db;

CREATE TABLE User (
    uuid CHAR(36) PRIMARY KEY,
    username VARCHAR(32) UNIQUE NOT NULL,
    displayName VARCHAR(50) NOT NULL,
    password VARCHAR(255) NOT NULL,
    bio TINYTEXT DEFAULT NULL,
    profilePic VARCHAR(255) DEFAULT NULL,
    created DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE Admin (
    userUuid CHAR(36) PRIMARY KEY,
    canManageAdmins BOOLEAN NOT NULL DEFAULT FALSE,
    canDeleteUsers BOOLEAN NOT NULL DEFAULT FALSE,
    FOREIGN KEY (userUuid) REFERENCES User(uuid) ON DELETE CASCADE
);

CREATE TABLE RecTable (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(50) NOT NULL,
    userUuid CHAR(36),
    isPrivate BOOLEAN NOT NULL DEFAULT FALSE,
    FOREIGN KEY (userUuid) REFERENCES User(uuid) ON DELETE CASCADE
);

CREATE TABLE Record (
    id INT AUTO_INCREMENT PRIMARY KEY,
    added DATETIME NOT NULL,
    artist VARCHAR(255),
    cover VARCHAR(255),
    name VARCHAR(255) NOT NULL,
    rating TINYINT,
    release_year YEAR,
    isCustom BOOLEAN NOT NULL DEFAULT FALSE,
    userUuid CHAR(36),
    tableId INT,
    review TEXT,
    masterId INT,
    reviewLikes INT DEFAULT 0,
    FOREIGN KEY (masterId) REFERENCES Master(id) ON DELETE SET NULL,
    FOREIGN KEY (userUuid) REFERENCES User(uuid) ON DELETE CASCADE,
    FOREIGN KEY (tableId) REFERENCES RecTable(id) ON DELETE CASCADE
);

CREATE TABLE LikedReview (
    userUuid CHAR(36) NOT NULL,
    recordId INT NOT NULL,
    created DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (userUuid, recordId),
    FOREIGN KEY (userUuid) REFERENCES User(uuid) ON DELETE CASCADE,
    FOREIGN KEY (recordId) REFERENCES Record(id) ON DELETE CASCADE
);

CREATE TABLE Tag (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(50) NOT NULL,
    userUuid CHAR(36),
    created DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (userUuid) REFERENCES User(uuid) ON DELETE CASCADE
);

CREATE TABLE Tagged (
    recordId INT,
    tagId INT,
    created DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
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
    created DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (userUuid, followsUuid),
    FOREIGN KEY (userUuid) REFERENCES User(uuid) ON DELETE CASCADE,
    FOREIGN KEY (followsUuid) REFERENCES User(uuid) ON DELETE CASCADE
);

CREATE TABLE List (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(50) NOT NULL,
    userUuid CHAR(36),
    isPrivate BOOLEAN NOT NULL DEFAULT FALSE,
    likes INT DEFAULT 0,
    picture VARCHAR(255) DEFAULT NULL,
    description TEXT DEFAULT NULL,
    created DATETIME NOT NULL,
    FOREIGN KEY (userUuid) REFERENCES User(uuid) ON DELETE CASCADE
);

CREATE TABLE ListRecord (
    id INT AUTO_INCREMENT PRIMARY KEY,
    added DATETIME NOT NULL,
    artist VARCHAR(255),
    cover VARCHAR(255),
    name VARCHAR(255) NOT NULL,
    rating TINYINT,
    release_year YEAR,
    sortOrder INT DEFAULT 0,
    userUuid CHAR(36),
    listId INT,
    masterId INT,
    reviewLikes INT DEFAULT 0,
    FOREIGN KEY (masterId) REFERENCES Master(id) ON DELETE SET NULL,
    FOREIGN KEY (userUuid) REFERENCES User(uuid) ON DELETE CASCADE,
    FOREIGN KEY (listId) REFERENCES List(id) ON DELETE CASCADE
);

CREATE INDEX idx_listrecord_list_order ON ListRecord(listId, sortOrder);

CREATE TABLE ListLike (
    userUuid CHAR(36) NOT NULL,
    listId INT NOT NULL,
    created DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (userUuid, listId),
    FOREIGN KEY (userUuid) REFERENCES User(uuid) ON DELETE CASCADE,
    FOREIGN KEY (listId) REFERENCES List(id) ON DELETE CASCADE
);

CREATE INDEX idx_follows_followed ON Follows (followsUuid);

CREATE TABLE Master (
    id INT PRIMARY KEY,
    artist VARCHAR(255),
    cover VARCHAR(255),
    created DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    name VARCHAR(255) NOT NULL,
    release_year YEAR,
    rating0 INT DEFAULT 0,
    rating1 INT DEFAULT 0,
    rating2 INT DEFAULT 0,
    rating3 INT DEFAULT 0,
    rating4 INT DEFAULT 0,
    rating5 INT DEFAULT 0,
    rating6 INT DEFAULT 0,
    rating7 INT DEFAULT 0,
    rating8 INT DEFAULT 0,
    rating9 INT DEFAULT 0,
    rating10 INT DEFAULT 0,
    ratingAve DECIMAL(3,1) NULL COMMENT 'Average of ratings 1-10 (weighted)'
);

-- Keep Master rating tallies (rating1..rating10) and ratingAve in sync with Record changes
DELIMITER $$

DROP PROCEDURE IF EXISTS update_master_ratings $$
CREATE PROCEDURE update_master_ratings(IN p_master_id INT)
BEGIN
    DECLARE c0 INT DEFAULT 0;
    DECLARE c1 INT DEFAULT 0;
    DECLARE c2 INT DEFAULT 0;
    DECLARE c3 INT DEFAULT 0;
    DECLARE c4 INT DEFAULT 0;
    DECLARE c5 INT DEFAULT 0;
    DECLARE c6 INT DEFAULT 0;
    DECLARE c7 INT DEFAULT 0;
    DECLARE c8 INT DEFAULT 0;
    DECLARE c9 INT DEFAULT 0;
    DECLARE c10 INT DEFAULT 0;
    DECLARE total INT DEFAULT 0;
    DECLARE weighted INT DEFAULT 0;

    SELECT
        SUM(CASE WHEN rating = 0 THEN 1 ELSE 0 END),
        SUM(CASE WHEN rating = 1 THEN 1 ELSE 0 END),
        SUM(CASE WHEN rating = 2 THEN 1 ELSE 0 END),
        SUM(CASE WHEN rating = 3 THEN 1 ELSE 0 END),
        SUM(CASE WHEN rating = 4 THEN 1 ELSE 0 END),
        SUM(CASE WHEN rating = 5 THEN 1 ELSE 0 END),
        SUM(CASE WHEN rating = 6 THEN 1 ELSE 0 END),
        SUM(CASE WHEN rating = 7 THEN 1 ELSE 0 END),
        SUM(CASE WHEN rating = 8 THEN 1 ELSE 0 END),
        SUM(CASE WHEN rating = 9 THEN 1 ELSE 0 END),
        SUM(CASE WHEN rating = 10 THEN 1 ELSE 0 END),
        SUM(CASE WHEN rating BETWEEN 1 AND 10 THEN 1 ELSE 0 END),
        SUM(CASE WHEN rating BETWEEN 1 AND 10 THEN rating ELSE 0 END)
    INTO c0, c1, c2, c3, c4, c5, c6, c7, c8, c9, c10, total, weighted
        FROM Record
        WHERE masterId = p_master_id
            AND (isCustom IS NULL OR isCustom = FALSE);

    UPDATE Master
    SET rating0 = COALESCE(c0, 0),
        rating1 = COALESCE(c1, 0),
        rating2 = COALESCE(c2, 0),
        rating3 = COALESCE(c3, 0),
        rating4 = COALESCE(c4, 0),
        rating5 = COALESCE(c5, 0),
        rating6 = COALESCE(c6, 0),
        rating7 = COALESCE(c7, 0),
        rating8 = COALESCE(c8, 0),
        rating9 = COALESCE(c9, 0),
        rating10 = COALESCE(c10, 0),
        ratingAve = CASE WHEN total > 0 THEN ROUND(weighted / total, 1) ELSE NULL END
    WHERE id = p_master_id;
END $$

DROP TRIGGER IF EXISTS trg_record_after_insert $$
CREATE TRIGGER trg_record_after_insert
AFTER INSERT ON Record
FOR EACH ROW
BEGIN
    IF NEW.masterId IS NOT NULL THEN
        CALL update_master_ratings(NEW.masterId);
    END IF;
END $$

DROP TRIGGER IF EXISTS trg_record_after_update $$
CREATE TRIGGER trg_record_after_update
AFTER UPDATE ON Record
FOR EACH ROW
BEGIN
    IF OLD.masterId IS NOT NULL AND OLD.masterId <> NEW.masterId THEN
        CALL update_master_ratings(OLD.masterId);
    END IF;
    IF NEW.masterId IS NOT NULL THEN
        CALL update_master_ratings(NEW.masterId);
    END IF;
END $$

DROP TRIGGER IF EXISTS trg_record_after_delete $$
CREATE TRIGGER trg_record_after_delete
AFTER DELETE ON Record
FOR EACH ROW
BEGIN
    IF OLD.masterId IS NOT NULL THEN
        CALL update_master_ratings(OLD.masterId);
    END IF;
END $$

DROP TRIGGER IF EXISTS trg_likedreview_after_insert $$
CREATE TRIGGER trg_likedreview_after_insert
AFTER INSERT ON LikedReview
FOR EACH ROW
BEGIN
    UPDATE Record
    SET reviewLikes = COALESCE(reviewLikes, 0) + 1
    WHERE id = NEW.recordId;
END $$

DROP TRIGGER IF EXISTS trg_likedreview_after_delete $$
CREATE TRIGGER trg_likedreview_after_delete
AFTER DELETE ON LikedReview
FOR EACH ROW
BEGIN
    UPDATE Record
    SET reviewLikes = CASE
        WHEN COALESCE(reviewLikes, 0) > 0 THEN COALESCE(reviewLikes, 0) - 1
        ELSE 0
    END
    WHERE id = OLD.recordId;
END $$

DELIMITER ;
