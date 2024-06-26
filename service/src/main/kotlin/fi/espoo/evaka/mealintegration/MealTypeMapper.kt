// SPDX-FileCopyrightText: 2017-2024 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later
package fi.espoo.evaka.mealintegration

interface MealTypeMapper {
    fun toMealId(mealType: MealType, specialDiet: Boolean): Int
}

/** Kangasala mappings */
object DefaultMealTypeMapper : MealTypeMapper {
    override fun toMealId(mealType: MealType, specialDiet: Boolean): Int =
        if (specialDiet) {
            when (mealType) {
                MealType.BREAKFAST -> 143
                MealType.LUNCH -> 145
                MealType.LUNCH_PRESCHOOL -> 24
                MealType.SNACK -> 160
                MealType.SUPPER -> 28
                MealType.EVENING_SNACK -> 31
            }
        } else
            when (mealType) {
                MealType.BREAKFAST -> 162
                MealType.LUNCH -> 175
                MealType.LUNCH_PRESCHOOL -> 22
                MealType.SNACK -> 152
                MealType.SUPPER -> 27
                MealType.EVENING_SNACK -> 30
            }
}
