package com.stratoslabs.flightcraft

import android.util.Log
import com.facebook.react.bridge.*
import com.google.android.gms.common.api.ApiException
import com.google.android.gms.games.PlayGames

class PlayGamesModule(
    private val reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "PlayGamesModule"

    private val TAG = "PlayGamesModule"

    // ── Sign In ───────────────────────────────────────────────────
    @ReactMethod
    fun signIn(promise: Promise) {
        val activity = currentActivity
        if (activity == null) {
            Log.e(TAG, "signIn: no activity")
            promise.reject("NO_ACTIVITY", "No activity available")
            return
        }

        Log.d(TAG, "signIn: checking isAuthenticated...")

        PlayGames.getGamesSignInClient(activity)
            .isAuthenticated()
            .addOnSuccessListener { authResult ->
                Log.d(TAG, "isAuthenticated result: ${authResult.isAuthenticated}")

                if (authResult.isAuthenticated) {
                    fetchPlayer(activity, promise)
                } else {
                    Log.d(TAG, "Not authenticated — calling signIn()...")
                    PlayGames.getGamesSignInClient(activity)
                        .signIn()
                        .addOnSuccessListener {
                            Log.d(TAG, "signIn() succeeded — fetching player...")
                            fetchPlayer(activity, promise)
                        }
                        .addOnFailureListener { e ->
                            val code = (e as? ApiException)?.statusCode
                            Log.e(TAG, "signIn() failed — statusCode: $code message: ${e.message}")
                            promise.reject("SIGN_IN_FAILED", "statusCode=$code: ${e.message}", e)
                        }
                }
            }
            .addOnFailureListener { e ->
                val code = (e as? ApiException)?.statusCode
                Log.e(TAG, "isAuthenticated failed — statusCode: $code message: ${e.message}")
                promise.reject("AUTH_ERROR", "statusCode=$code: ${e.message}", e)
            }
    }

    private fun fetchPlayer(activity: android.app.Activity, promise: Promise) {
        Log.d(TAG, "fetchPlayer: getting currentPlayer...")
        PlayGames.getPlayersClient(activity)
            .currentPlayer
            .addOnSuccessListener { player ->
                Log.d(TAG, "fetchPlayer: got player ${player.playerId}")
                val map = Arguments.createMap().apply {
                    putString("playerId",    player.playerId)
                    putString("displayName", player.displayName)
                    player.iconImageUri?.let { putString("avatarUrl", it.toString()) }
                }
                promise.resolve(map)
            }
            .addOnFailureListener { e ->
                val code = (e as? ApiException)?.statusCode
                Log.e(TAG, "fetchPlayer failed — statusCode: $code message: ${e.message}")
                promise.reject("PLAYER_ERROR", "statusCode=$code: ${e.message}", e)
            }
    }

    // ── Achievements ──────────────────────────────────────────────
    @ReactMethod
    fun unlockAchievement(achievementId: String) {
        val activity = currentActivity ?: return
        PlayGames.getAchievementsClient(activity).unlock(achievementId)
    }

    @ReactMethod
    fun setAchievementSteps(achievementId: String, steps: Int) {
        val activity = currentActivity ?: return
        PlayGames.getAchievementsClient(activity).setSteps(achievementId, steps)
    }

    @ReactMethod
    fun showAchievements() {
        val activity = currentActivity ?: return
        PlayGames.getAchievementsClient(activity)
            .achievementsIntent
            .addOnSuccessListener { activity.startActivityForResult(it, 9003) }
    }

    // ── Leaderboard ───────────────────────────────────────────────
    @ReactMethod
    fun submitScore(leaderboardId: String, score: Double) {
        val activity = currentActivity ?: return
        PlayGames.getLeaderboardsClient(activity)
            .submitScore(leaderboardId, score.toLong())
    }

    @ReactMethod
    fun showLeaderboard(leaderboardId: String) {
        val activity = currentActivity ?: return
        PlayGames.getLeaderboardsClient(activity)
            .getLeaderboardIntent(leaderboardId)
            .addOnSuccessListener { activity.startActivityForResult(it, 9004) }
    }
}