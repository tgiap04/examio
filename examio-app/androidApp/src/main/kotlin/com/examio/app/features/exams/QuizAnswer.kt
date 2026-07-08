package com.examio.app.features.exams

/**
 * Quiz answers are represented system-wide as option LETTERS ("A", "B", "C", ...).
 * The backend stores `quizQuestion.answer` as a letter and scores by comparing it
 * to the submitted `chosen_option` verbatim, so the mobile client must send letters
 * too. These helpers mirror examio-fe's `quizAnswerUtils.resolveAnswerIndex`.
 */

private val answerLetters = listOf("A", "B", "C", "D", "E", "F", "G", "H")

/** The option letter for a zero-based index (0 -> "A"). */
fun answerLetter(index: Int): String = answerLetters.getOrElse(index) { "${index + 1}" }

/**
 * Resolve a stored answer to its zero-based option index. Accepts a letter ("A"),
 * a numeric string ("0"), or the full option text; returns -1 when unresolvable.
 */
fun resolveAnswerIndex(answer: String?, options: List<String>): Int {
    val trimmed = answer?.trim().orEmpty()
    if (trimmed.isEmpty()) return -1

    val letterIdx = answerLetters.indexOf(trimmed.uppercase())
    if (letterIdx in options.indices) return letterIdx

    trimmed.toIntOrNull()?.let { if (it in options.indices) return it }

    val lower = trimmed.lowercase()
    options.forEachIndexed { i, opt ->
        val clean = opt.trim().replace(Regex("^[A-D]\\s*[.):\\s]+"), "").trim()
        if (clean.equals(lower, ignoreCase = true) || opt.trim().equals(lower, ignoreCase = true)) return i
    }
    return -1
}
