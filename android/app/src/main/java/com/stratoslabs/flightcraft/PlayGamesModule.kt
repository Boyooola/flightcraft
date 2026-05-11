package com.stratoslabs.flightcraft

import android.app.Activity
import com.facebook.react.bridge.*
import com.google.android.gms.games.PlayGames

class PlayGamesModule(
    private val reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String {
        return "PlayGamesModule"
    }

    // ─────────────────────────────────────────────
    // Auto Sign-In
    // ─────────────────────────────────────────────
    @ReactMethod
    fun signIn(promise: Promise) {
        val activity = reactApplicationContext.currentActivity ?: return

        if (activity == null) {
            promise.reject("NO_ACTIVITY", "Activity doesn't exist")
            return
        }

        PlayGames.getGamesSignInClient(activity)
            .isAuthenticated()
            .addOnSuccessListener { authResult ->

                if (authResult.isAuthenticated) {

                    PlayGames.getPlayersClient(activity)
                        .currentPlayer
                        .addOnSuccessListener { player ->

                            val map = Arguments.createMap()

                            map.putString("playerId", player.playerId)
                            map.putString("displayName", player.displayName)

                            if (player.iconImageUri != null) {
                                map.putString(
                                    "avatarUrl",
                                    player.iconImageUri.toString()
                                )
                            }

                            promise.resolve(map)
                        }
                        .addOnFailureListener {
                            promise.reject("PLAYER_ERROR", it)
                        }

                } else {

                    PlayGames.getGamesSignInClient(activity)
                        .signIn()
                        .addOnSuccessListener {

                            PlayGames.getPlayersClient(activity)
                                .currentPlayer
                                .addOnSuccessListener { player ->

                                    val map = Arguments.createMap()

                                    map.putString("playerId", player.playerId)
                                    map.putString("displayName", player.displayName)

                                    if (player.iconImageUri != null) {
                                        map.putString(
                                            "avatarUrl",
                                            player.iconImageUri.toString()
                                        )
                                    }

                                    promise.resolve(map)
                                }
                                .addOnFailureListener {
                                    promise.reject("PLAYER_ERROR", it)
                                }
                        }
                        .addOnFailureListener {
                            promise.reject("SIGN_IN_FAILED", it)
                        }
                }
            }
            .addOnFailureListener {
                promise.reject("AUTH_ERROR", it)
            }
    }

    // ─────────────────────────────────────────────
    // Achievements
    // ─────────────────────────────────────────────
    @ReactMethod
    fun unlockAchievement(achievementId: String) {
        val activity = reactApplicationContext.currentActivity ?: return

        PlayGames.getAchievementsClient(activity)
            .unlock(achievementId)
    }

    // ─────────────────────────────────────────────
    // Leaderboards
    // ─────────────────────────────────────────────
    @ReactMethod
    fun submitScore(leaderboardId: String, score: Double) {
        val activity = reactApplicationContext.currentActivity ?: return

        PlayGames.getLeaderboardsClient(activity)
            .submitScore(leaderboardId, score.toLong())
    }

    @ReactMethod
    fun showAchievements() {
        val activity = reactApplicationContext.currentActivity ?: return

        PlayGames.getAchievementsClient(activity)
            .achievementsIntent
            .addOnSuccessListener {
                activity.startActivityForResult(it, 9003)
            }
    }

    @ReactMethod
    fun showLeaderboard(leaderboardId: String) {
        val activity = reactApplicationContext.currentActivity ?: return

        PlayGames.getLeaderboardsClient(activity)
            .getLeaderboardIntent(leaderboardId)
            .addOnSuccessListener {
                activity.startActivityForResult(it, 9004)
            }
    }

    @ReactMethod
    fun setAchievementSteps(
        achievementId: String,
        steps: Int
    ) {
         val activity = reactApplicationContext.currentActivity ?: return

        PlayGames.getAchievementsClient(activity)
            .setSteps(achievementId, steps)
    }
}