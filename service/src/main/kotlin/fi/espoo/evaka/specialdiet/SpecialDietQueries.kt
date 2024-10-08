// SPDX-FileCopyrightText: 2017-2021 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

package fi.espoo.evaka.specialdiet

import fi.espoo.evaka.shared.ChildId
import fi.espoo.evaka.shared.DaycareId
import fi.espoo.evaka.shared.db.Database
import java.time.LocalDate
import org.jdbi.v3.core.mapper.Nested
import org.jdbi.v3.core.mapper.PropagateNull

data class MealTexture(@PropagateNull val id: Int?, val name: String)

data class SpecialDiet(@PropagateNull val id: Int?, val abbreviation: String)

data class NulledSpecialDiet(
    val unitId: DaycareId,
    val childId: ChildId,
    @Nested("special_diet") val specialDiet: SpecialDiet,
)

/**
 * Sets child's special diets to null if there are some children whose special diet is not contained
 * in the new list. Returns a map from ChildId to SpecialDiet that was previously set for that
 * child.
 */
fun Database.Transaction.resetSpecialDietsNotContainedWithin(
    today: LocalDate,
    specialDietList: List<SpecialDiet>,
): List<NulledSpecialDiet> {
    val newSpecialDietIds = specialDietList.map { it.id }

    val previousDiets =
        createQuery {
                sql(
                    """
SELECT
    pl.unit_id,
    child.id AS child_id,
    special_diet.id AS special_diet_id,
    special_diet.abbreviation AS special_diet_abbreviation
FROM child 
JOIN LATERAL (
    SELECT unit_id FROM placement
    WHERE child_id = child.id AND daterange(start_date, end_date, '[]') && daterange(${bind(today)}, NULL)
    ORDER BY start_date
    LIMIT 1
) pl ON true
JOIN special_diet ON child.diet_id = special_diet.id
WHERE child.diet_id != ALL (${bind(newSpecialDietIds)})
        """
                )
            }
            .toList<NulledSpecialDiet>()

    execute {
        sql("UPDATE child SET diet_id = null WHERE diet_id != ALL (${bind(newSpecialDietIds)})")
    }

    return previousDiets
}

fun Database.Transaction.resetMealTexturesNotContainedWithin(
    mealTextureList: List<MealTexture>
): Int {
    val newMealTextureIds = mealTextureList.map { it.id }
    val affectedRows = execute {
        sql(
            "UPDATE child SET meal_texture_id = null WHERE meal_texture_id != ALL (${bind(newMealTextureIds)})"
        )
    }
    return affectedRows
}

/** Replaces special_diet list with the given list. Returns count of removed diets */
fun Database.Transaction.setSpecialDiets(specialDietList: List<SpecialDiet>): Int {
    val newSpecialDietIds = specialDietList.map { it.id }
    val deletedDietCount = execute {
        sql("DELETE FROM special_diet WHERE id != ALL (${bind(newSpecialDietIds)})")
    }
    executeBatch(specialDietList) {
        sql(
            """
INSERT INTO special_diet (id, abbreviation)
VALUES (
    ${bind{it.id}},
    ${bind{it.abbreviation}}
)
ON CONFLICT (id) DO UPDATE SET
  abbreviation = excluded.abbreviation
"""
        )
    }
    return deletedDietCount
}

fun Database.Transaction.setMealTextures(mealTextures: List<MealTexture>): Int {
    val newTextureIds = mealTextures.map { it.id }
    val deletedTextureCount = execute {
        sql("DELETE FROM meal_texture WHERE id != ALL (${bind(newTextureIds)})")
    }
    executeBatch(mealTextures) {
        sql(
            """
INSERT INTO meal_texture (id, name)
VALUES (
    ${bind{it.id}},
    ${bind{it.name}}
)
ON CONFLICT (id) DO UPDATE SET
  name = excluded.name
"""
        )
    }
    return deletedTextureCount
}

fun Database.Transaction.getSpecialDiets(): List<SpecialDiet> {
    return createQuery { sql("SELECT id, abbreviation FROM special_diet") }.toList<SpecialDiet>()
}

fun Database.Transaction.getMealTextures(): List<MealTexture> {
    return createQuery { sql("SELECT id, name FROM meal_texture") }.toList<MealTexture>()
}
