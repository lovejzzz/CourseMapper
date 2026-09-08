# v3 案例建设状态

2026-09-07。协议仍为 `edutool-classroom-v3-protocol-1`。当前有两个 experiment 和两个 quantity 开发包，**不是完整六十包，manifest 尚未冻结，v3 尚未执行**。输入与参考分开保存；参考均由实现者编写，未取得独立教师审阅。

| 包                | 语言 | 来源家族                        | 范围      | 设计重点                                                                 |
| ----------------- | ---- | ------------------------------- | --------- | ------------------------------------------------------------------------ |
| experiment-dev-01 | en   | workshop-stamp-drying           | supported | 墨水配方与温度同时改变；独立卡片、可执行测量和新试验结果边界             |
| experiment-dev-02 | zh   | cup-sleeve-temperature-loss     | supported | 保温套与起始水温同时改变；杯子与重复读数的区别、温降测量和随机分配       |
| quantity-dev-01   | en   | library-tablet-return-pooling   | supported | 自然表达的不等规模计数、明确互斥身份、对象权重与组权重、无关记录         |
| quantity-dev-02   | zh   | campus-observation-club-overlap | supported | 共同名册、组内去重与跨组重复、可实现的范围、答案未变但推理变化的来源修改 |

本次先写输入与参考，再修改新版显式操作。`43ccc416` 基线的现有 `buildSharedTeachingTask` 对两个输入均返回 null；这是直接调用现有确定性任务构建器的结果，**不是自然语言 Scion 或完整管线的失败率**。原始结果保存于 `.audit-work/v0200-teaching-system/m2-comparison/baseline.json`。

参考使用 [NIST 完全随机设计](https://www.itl.nist.gov/div898/handbook/pri/section3/pri331.htm) 的单位分配与运行顺序原则，以及 [NIST 随机区组设计](https://www.itl.nist.gov/div898/handbook/pri/section3/pri332.htm) 对可控干扰因素和区组内比较的说明。网页于本次检索核对；这些方法来源不证明虚构案例的结果，也不构成教学效果证据。具体的资源数量和操作步骤是本测试的设计约束或参考方案，不能当作样本量充分性证明。

后续仍按固定协议完成各族、语言与限制类型的分布，审查来源家族隔离，并在完整案例审读后冻结 manifest。本文不改变固定分母或准入标准。

两个quantity包的分数/范围及修改结果已独立用有理数和穷举重叠检查。直接确定性任务构建器对它们均返回null，体现自然表达和中文数量操作的覆盖缺口；该诊断不是完整生成流程或Scion实测。并行检查发现旧合并路径可能在未证明组间对象互斥、甚至存在重复成员记录时仍断言精确合并比例，已增加显式成员范围检查。旧v2原包与历史收据不修改；补充了互斥条件的回归变体单独标为development，不计旧包通过。
