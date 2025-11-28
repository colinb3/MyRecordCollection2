CREATE DATABASE mrc_db;
USE mrc_db;

CREATE TABLE User (
    uuid CHAR(36) PRIMARY KEY,
    username VARCHAR(32) UNIQUE NOT NULL,
    displayName VARCHAR(50) NOT NULL,
    password VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    bio TINYTEXT DEFAULT NULL,
    profilePic VARCHAR(255) DEFAULT NULL,
    created DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE ListeningTo (
    userUuid CHAR(36) PRIMARY KEY,
    masterId INT NOT NULL,
    created DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (masterId) REFERENCES Master(id) ON DELETE CASCADE,
    FOREIGN KEY (userUuid) REFERENCES User(uuid) ON DELETE CASCADE
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

CREATE TABLE MasterGenre (
    masterId INT,
    genre VARCHAR(100),
    isStyle BOOLEAN,
    PRIMARY KEY (masterId, genre),
    FOREIGN KEY (masterId) REFERENCES Master(id) ON DELETE CASCADE
);

CREATE TABLE UserGenreInterest (
    userUuid CHAR(36),
    genre VARCHAR(100),
    tableName VARCHAR(13),
    isStyle BOOLEAN,
    rating DECIMAL(4,2),
    collectionPercent DECIMAL(5,2),
    recordCount INT DEFAULT 0,
    PRIMARY KEY (userUuid, genre, tableName),
    FOREIGN KEY (userUuid) REFERENCES User(uuid) ON DELETE CASCADE
);

CREATE TABLE GeneralReport (
    id INT AUTO_INCREMENT PRIMARY KEY,
    reportedBy CHAR(36),
    reason VARCHAR(50) NOT NULL,
    userNotes TEXT,
    created DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(20) NOT NULL DEFAULT 'Pending',
    adminNotes TEXT DEFAULT NULL,
    FOREIGN KEY (reportedBy) REFERENCES User(uuid) ON DELETE SET NULL
);

CREATE TABLE ReportedUser (
    id INT AUTO_INCREMENT PRIMARY KEY,
    reportedBy CHAR(36),
    reportedUser CHAR(36),
    reason VARCHAR(50) NOT NULL,
    userNotes TEXT,
    created DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(20) NOT NULL DEFAULT 'Pending',
    adminNotes TEXT DEFAULT NULL,
    FOREIGN KEY (reportedBy) REFERENCES User(uuid) ON DELETE SET NULL,
    FOREIGN KEY (reportedUser) REFERENCES User(uuid) ON DELETE SET NULL
);

CREATE TABLE ReportedRecord (
    id INT AUTO_INCREMENT PRIMARY KEY,
    reportedBy CHAR(36),
    recordId INT,
    reason VARCHAR(50) NOT NULL,
    userNotes TEXT,
    created DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(20) NOT NULL DEFAULT 'Pending',
    adminNotes TEXT DEFAULT NULL,
    FOREIGN KEY (reportedBy) REFERENCES User(uuid) ON DELETE CASCADE,
    FOREIGN KEY (recordId) REFERENCES Record(id) ON DELETE SET NULL
);

CREATE TABLE ReportedMaster (
    id INT AUTO_INCREMENT PRIMARY KEY,
    reportedBy CHAR(36),
    masterId INT,
    reason VARCHAR(50) NOT NULL,
    userNotes TEXT,
    created DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(20) NOT NULL DEFAULT 'Pending',
    adminNotes TEXT DEFAULT NULL,
    FOREIGN KEY (reportedBy) REFERENCES User(uuid) ON DELETE CASCADE,
    FOREIGN KEY (masterId) REFERENCES Master(id) ON DELETE SET NULL
);

CREATE TABLE ReportedList (
    id INT AUTO_INCREMENT PRIMARY KEY,
    reportedBy CHAR(36),
    listId INT,
    reason VARCHAR(50) NOT NULL,
    userNotes TEXT,
    created DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(20) NOT NULL DEFAULT 'Pending',
    adminNotes TEXT DEFAULT NULL,
    FOREIGN KEY (reportedBy) REFERENCES User(uuid) ON DELETE CASCADE,
    FOREIGN KEY (listId) REFERENCES List(id) ON DELETE SET NULL
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
    -- Update master ratings
    IF NEW.masterId IS NOT NULL THEN
        CALL update_master_ratings(NEW.masterId);
    END IF;
    
    -- Update user genre interests
    IF NEW.masterId IS NOT NULL AND (NEW.isCustom IS NULL OR NEW.isCustom = FALSE) THEN
        CALL update_user_all_genre_interests(NEW.userUuid);
    END IF;
END $$

DROP TRIGGER IF EXISTS trg_record_after_update $$
CREATE TRIGGER trg_record_after_update
AFTER UPDATE ON Record
FOR EACH ROW
BEGIN
    -- Update master ratings
    IF OLD.masterId IS NOT NULL AND OLD.masterId <> NEW.masterId THEN
        CALL update_master_ratings(OLD.masterId);
    END IF;
    IF NEW.masterId IS NOT NULL THEN
        CALL update_master_ratings(NEW.masterId);
    END IF;
    
    -- Update user genre interests if relevant fields changed
    IF (OLD.masterId IS NULL AND NEW.masterId IS NOT NULL) OR
       (OLD.masterId IS NOT NULL AND NEW.masterId IS NULL) OR
       (OLD.masterId <> NEW.masterId) OR
       (OLD.rating <> NEW.rating) OR
       (OLD.tableId <> NEW.tableId) OR
       (OLD.isCustom <> NEW.isCustom) THEN
        
        IF (OLD.isCustom IS NULL OR OLD.isCustom = FALSE) OR (NEW.isCustom IS NULL OR NEW.isCustom = FALSE) THEN
            CALL update_user_all_genre_interests(NEW.userUuid);
        END IF;
    END IF;
END $$

DROP TRIGGER IF EXISTS trg_record_after_delete $$
CREATE TRIGGER trg_record_after_delete
AFTER DELETE ON Record
FOR EACH ROW
BEGIN
    -- Update master ratings
    IF OLD.masterId IS NOT NULL THEN
        CALL update_master_ratings(OLD.masterId);
    END IF;
    
    -- Update user genre interests
    IF OLD.masterId IS NOT NULL AND (OLD.isCustom IS NULL OR OLD.isCustom = FALSE) THEN
        CALL update_user_all_genre_interests(OLD.userUuid);
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

-- Update UserGenreInterest for a specific user and genre
-- NOTE: Currently only tracks genres (isStyle = FALSE). To include styles in the future:
--   1. Change all "mg.isStyle = FALSE" to "TRUE" for styles, or remove the condition for both
--   2. Update the INSERT/DELETE statements to use the appropriate isStyle value
--   3. Consider creating separate procedures for genres vs styles, or add an isStyle parameter
DROP PROCEDURE IF EXISTS update_user_genre_interest $$
CREATE PROCEDURE update_user_genre_interest(IN p_user_uuid CHAR(36), IN p_genre VARCHAR(100), IN p_table_name VARCHAR(13))
BEGIN
    DECLARE avg_rating DECIMAL(4,2);
    DECLARE genre_count_all INT;
    DECLARE total_count INT;
    DECLARE collection_pct DECIMAL(5,2);
    
    -- Calculate average rating for records with this genre in specific table or all tables
    IF p_table_name = 'All' THEN
        SELECT AVG(r.rating)
        INTO avg_rating
        FROM Record r
        INNER JOIN MasterGenre mg ON r.masterId = mg.masterId
        WHERE r.userUuid = p_user_uuid
            AND mg.genre = p_genre
            AND mg.isStyle = FALSE
            AND (r.isCustom IS NULL OR r.isCustom = FALSE)
            AND r.rating BETWEEN 1 AND 10;
        
        SELECT COUNT(DISTINCT r.id)
        INTO genre_count_all
        FROM Record r
        INNER JOIN MasterGenre mg ON r.masterId = mg.masterId
        WHERE r.userUuid = p_user_uuid
            AND mg.genre = p_genre
            AND mg.isStyle = FALSE
            AND (r.isCustom IS NULL OR r.isCustom = FALSE);
        
        SELECT COUNT(*)
        INTO total_count
        FROM Record r
        WHERE r.userUuid = p_user_uuid
            AND (r.isCustom IS NULL OR r.isCustom = FALSE);
    ELSE
        -- Join with RecTable to get the correct tableId based on table name
        SELECT AVG(r.rating)
        INTO avg_rating
        FROM Record r
        INNER JOIN MasterGenre mg ON r.masterId = mg.masterId
        INNER JOIN RecTable rt ON r.tableId = rt.id
        WHERE r.userUuid = p_user_uuid
            AND rt.userUuid = p_user_uuid
            AND rt.name = p_table_name
            AND mg.genre = p_genre
            AND mg.isStyle = FALSE
            AND (r.isCustom IS NULL OR r.isCustom = FALSE)
            AND r.rating BETWEEN 1 AND 10;
        
        SELECT COUNT(DISTINCT r.id)
        INTO genre_count_all
        FROM Record r
        INNER JOIN MasterGenre mg ON r.masterId = mg.masterId
        INNER JOIN RecTable rt ON r.tableId = rt.id
        WHERE r.userUuid = p_user_uuid
            AND rt.userUuid = p_user_uuid
            AND rt.name = p_table_name
            AND mg.genre = p_genre
            AND mg.isStyle = FALSE
            AND (r.isCustom IS NULL OR r.isCustom = FALSE);
        
        SELECT COUNT(*)
        INTO total_count
        FROM Record r
        INNER JOIN RecTable rt ON r.tableId = rt.id
        WHERE r.userUuid = p_user_uuid
            AND rt.userUuid = p_user_uuid
            AND rt.name = p_table_name
            AND (r.isCustom IS NULL OR r.isCustom = FALSE);
    END IF;
    
    -- Calculate percentage using ALL genre records
    IF total_count > 0 AND genre_count_all > 0 THEN
        SET collection_pct = (genre_count_all / total_count) * 100;
        
        -- Insert or update the UserGenreInterest entry
        INSERT INTO UserGenreInterest (userUuid, genre, tableName, isStyle, rating, collectionPercent, recordCount)
        VALUES (p_user_uuid, p_genre, p_table_name, FALSE, ROUND(avg_rating, 2), collection_pct, genre_count_all)
        ON DUPLICATE KEY UPDATE
            rating = ROUND(VALUES(rating), 2),
            collectionPercent = VALUES(collectionPercent),
            recordCount = VALUES(recordCount);
    ELSE
        -- Remove entry if user has no records with this genre in this table
        DELETE FROM UserGenreInterest
        WHERE userUuid = p_user_uuid AND genre = p_genre AND tableName = p_table_name AND isStyle = FALSE;
    END IF;
END $$

-- Update all genre interests for a specific user
DROP PROCEDURE IF EXISTS update_user_all_genre_interests $$
CREATE PROCEDURE update_user_all_genre_interests(IN p_user_uuid CHAR(36))
BEGIN
    DECLARE done INT DEFAULT FALSE;
    DECLARE v_genre VARCHAR(100);
    DECLARE genre_cursor CURSOR FOR
        SELECT DISTINCT mg.genre
        FROM Record r
        INNER JOIN MasterGenre mg ON r.masterId = mg.masterId
        WHERE r.userUuid = p_user_uuid
            AND mg.isStyle = FALSE
            AND (r.isCustom IS NULL OR r.isCustom = FALSE);
    DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = TRUE;
    
    -- Clean up genres that user no longer has in any table
    DELETE ugi FROM UserGenreInterest ugi
    WHERE ugi.userUuid = p_user_uuid
        AND ugi.isStyle = FALSE
        AND NOT EXISTS (
            SELECT 1
            FROM Record r
            INNER JOIN MasterGenre mg ON r.masterId = mg.masterId
            LEFT JOIN RecTable rt ON r.tableId = rt.id AND rt.userUuid = p_user_uuid
            WHERE r.userUuid = p_user_uuid
                AND mg.genre = ugi.genre
                AND mg.isStyle = FALSE
                AND (r.isCustom IS NULL OR r.isCustom = FALSE)
                AND (ugi.tableName = 'All' OR rt.name = ugi.tableName)
        );
    
    -- Update each genre for all tables (All, My Collection, Wishlist, Listened)
    OPEN genre_cursor;
    read_loop: LOOP
        FETCH genre_cursor INTO v_genre;
        IF done THEN
            LEAVE read_loop;
        END IF;
        CALL update_user_genre_interest(p_user_uuid, v_genre, 'All');
        CALL update_user_genre_interest(p_user_uuid, v_genre, 'My Collection');
        CALL update_user_genre_interest(p_user_uuid, v_genre, 'Wishlist');
        CALL update_user_genre_interest(p_user_uuid, v_genre, 'Listened');
    END LOOP;
    CLOSE genre_cursor;
END $$

-- Update genre interests for all users who have records with a specific master
DROP PROCEDURE IF EXISTS update_genre_interests_for_master $$
CREATE PROCEDURE update_genre_interests_for_master(IN p_master_id INT)
BEGIN
    DECLARE done INT DEFAULT FALSE;
    DECLARE v_user_uuid CHAR(36);
    DECLARE user_cursor CURSOR FOR
        SELECT DISTINCT r.userUuid
        FROM Record r
        WHERE r.masterId = p_master_id
            AND (r.isCustom IS NULL OR r.isCustom = FALSE);
    DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = TRUE;
    
    -- Update genre interests for each user who has this master
    OPEN user_cursor;
    update_loop: LOOP
        FETCH user_cursor INTO v_user_uuid;
        IF done THEN
            LEAVE update_loop;
        END IF;
        CALL update_user_all_genre_interests(v_user_uuid);
    END LOOP;
    CLOSE user_cursor;
END $$

-- Trigger when a genre is added to a master
DROP TRIGGER IF EXISTS trg_mastergenre_after_insert $$
CREATE TRIGGER trg_mastergenre_after_insert
AFTER INSERT ON MasterGenre
FOR EACH ROW
BEGIN
    -- Only update for genres (not styles) since UserGenreInterest only tracks genres
    IF NEW.isStyle = FALSE THEN
        CALL update_genre_interests_for_master(NEW.masterId);
    END IF;
END $$

-- Trigger when a genre is removed from a master
DROP TRIGGER IF EXISTS trg_mastergenre_after_delete $$
CREATE TRIGGER trg_mastergenre_after_delete
AFTER DELETE ON MasterGenre
FOR EACH ROW
BEGIN
    -- Only update for genres (not styles) since UserGenreInterest only tracks genres
    IF OLD.isStyle = FALSE THEN
        CALL update_genre_interests_for_master(OLD.masterId);
    END IF;
END $$

DELIMITER ;
