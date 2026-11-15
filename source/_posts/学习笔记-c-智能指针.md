---
title: 智能指针详解（大长篇）
date: '2026-11-15 20:30:00'
updated: '2026-11-15 21:27:40'
categories:
  - 学习笔记
tags:
  - C++
  - 智能指针
  - RAII
  - shared_ptr
description: >-
  这篇博客详细讲解了C++智能指针的所有权语义，重点介绍了unique_ptr、shared_ptr和weak_ptr的用法、实现原理及常见陷阱（如重复释放、循环引用泄漏），并给出函数传参时的选择建议。
cover: /img/covers/preview-upscaled-4x-mwcw4ozn.webp
copyright: true
---

# 智能指针详解

观前提醒：请先阅读[RAII详解（长篇）](/2026/11/08/学习笔记-c-raii/)和[移动语义和右值引用](/2026/11/12/学习笔记-c-移动语义-右值引用/)



> 给裸指针套上一层类，在析构函数里写一句 `delete`，就能防止内存泄漏了吗？如果真这么简单，C++ 为什么还要折腾出 `unique_ptr`、`shared_ptr` 和 `weak_ptr`？更离谱的是，有时候你明明全程用了智能指针，对象依然一个都没有释放？！

## 已经学过 RAII，为什么还会重复释放？

前两篇我们分别聊过 `RAII` 和移动语义：前者让资源跟着管理对象一起清理，后者让某些资源可以转移所有权，避免不必要的深拷贝

把它们组合起来，似乎智能指针已经呼之欲出了

```cpp
class IntOwner {
public:
    explicit IntOwner(int* p) : ptr(p) {}
    ~IntOwner() { delete ptr; }

private:
    int* ptr;
};
```

看起来很合理，构造时接管地址，析构时释放，提前 `return` 和正常的异常栈展开也能帮忙调用析构函数

但只要加上一行：

```cpp
IntOwner a(new int(42));
IntOwner b = a;  
```

翻车了

两份管理对象保存同一个地址，离开作用域时各自执行 `delete`，导致重复释放，这是未定义行为

问题出在哪里？析构函数确实被调用了，甚至调用得过于积极

**`RAII` 解决了把清理动作放在哪里，但你仍然需要决定这份资源归谁管，以及复制管理对象意味着什么**

==这就是智能指针最重要的一层：所有权语义==

需要补充一句，`RAII` 不要求管理对象一定在栈上。它也可以是另一个对象的成员，或者被其他所有者间接管理。关键是管理对象自身的生命周期也必须受到正确管理；如果 `new` 出一个管理对象后把它泄漏，析构函数当然没有机会替你收尾

## 所有权归属

假设你写了一个处理图片的程序，一张图片要被预览窗口、导出函数、压缩函数访问

三个地方都要访问，就需要三个所有者吗？

不一定

如果程序结构已经保证：图片归编辑器所有，所有处理都在编辑器的有效生命周期内完成，那么其他函数借用图片即可

```cpp
struct Image
{
	//压缩图片
	void compress(){}
};
//导出图片
void exportImage(const Image& img)
{

}

auto image = std::make_unique<Image>();
image->compress();
exportImage(*image);
```

这里有多个使用者，但只有一个负责生命周期的所有者

**能访问对象，不等于必须参与决定对象什么时候销毁**

标准库把「谁负责释放这件事」做成了几种现成的工具

不必一次全记住，我们先从最简单、也最常用的独占所有权 `unique_ptr` 开始

需要多个所有者、以及只想观察对象而不延长它生命周期的情况，后面会逐个讲到，结尾有一张对照表

顺带一提，裸指针 `T*` 和引用 `T&` 在现代 C++ 里通常只表达借用，也就是我不负责释放，只是用一下的意思

==但这只是接口约定，语言并不会禁止你用裸指针拥有资源，老式 C 接口也常常用裸指针交付所有权==

![unique_ptr 的独占所有权与 shared_ptr 的共享所有权对比](/img/posts/smart-01-ownership.png)

## unique_ptr：独占所有权，不可复制只能移动

先来看最自然的情况，一份资源只由一个所有者管理

`std::make_unique<int>(42)` 是创建 `unique_ptr` 的推荐写法

它分配一个 `int` 并立刻交给 `unique_ptr` 管理，你不用自己写 `new`

```cpp
#include <memory>
#include <utility>
//这里的auto是让编译器按右边的表达式推导类型，这里推导类型为unique_ptr<int>
auto p = std::make_unique<int>(42);
//编译错误，不允许复制所有权
auto copy = p;
//允许利用移动语义来转移所有权，转移后p为空，q拥有了原来p的所有权，也就是q管理现在的int对象
auto q = std::move(p);
```

`unique_ptr` 禁用拷贝构造和拷贝赋值，支持移动构造和移动赋值

这与上一篇正好接上，`std::move(p)` 本身只是类型转换，真正把地址赋值过去、把源指针变为空的，是 `unique_ptr` 的移动操作

注意，这里的源指针变为空是 `unique_ptr` 对移动后状态的明确保证，不能把它扩展成所有类型移动后都会被清空

到了这里，它为什么叫「独占」也就清楚了

**独占的是释放责任，不是访问权限，一个 `unique_ptr` 管理的对象，完全可以被多个裸指针或引用临时访问**

但借用者不会自动延长对象寿命

```cpp
auto owner = std::make_unique<int>(32);
//get()：为借出内部资源地址，也就是返回资源地址，不交出所有权
int* observer = owner.get();

int value = *observer;
//reset()：释放内部资源，也就是删除所管理的对象，将指针置为空
owner.reset();

//此时指针已经悬空，访问会导致未定义行为
int bad = *observer;
```

==智能指针不会扫描全程序，找到所有指向这块内存的裸指针，再把它们统一置空，所以要注意==

### get、release、reset 的区别

`get()` 返回存储的指针，不交出所有权，也不增加任何生命周期保证

`release()` 返回指针，并让这个 `unique_ptr` 放弃所有权，智能指针对象变为空，但不会删除管理的资源对象

`reset()` 放弃当前所有权，并删除原来管理的对象，带新指针的重载还会接管新指针

这里说的删除默认就是 `delete`

智能指针其实允许你把清理动作换成别的（比如关闭文件），这个可替换的清理动作叫**删除器**，后面会专门讲

```cpp
auto p = std::make_unique<int>(10);
//p为空，但是int对象还在
int* raw = p.release();
//立即建立新的所有者
std::unique_ptr<int> q(raw);
//q不仅放弃所有权且释放资源
q.reset();
```

这个例子只是为了对比接口，日常在两个 `unique_ptr` 之间交接，直接移动更清楚，不必绕一圈裸指针

`release` 中释放的是管理责任，`reset` 才会释放原资源，不要根据英文名称**想当然**

```cpp
//reset如果传参是先 delete 旧资源 → 再把内部地址换成传入的新指针
//故而下面的是错误操作，会接管已经被delete的资源
p.reset(p.get());
//手动释放也是错误的，因为p并未放弃所有权，所以会在p析构时再次delete，导致重复释放
delete p.get();
```

### 手写一个简化版 unique_ptr

下面是仅用于理解的独占指针，管理单个 `new T` 对象，不支持数组、自定义清理方式等完整标准库接口

```cpp
#include <iostream>
using namespace std;

template<class T>

class MiniUnique
{
public:
	MiniUnique(T* p) noexcept :ptr(p)
	{
		cout << "MiniUnique constructor" << endl;
	}
	~MiniUnique()
	{
		cout << "MiniUnique destructor" << endl;
		delete ptr;
	}

	//禁止拷贝构造和拷贝赋值
	explicit MiniUnique(const MiniUnique& other) noexcept = delete;
	MiniUnique<T>& operator=(const MiniUnique& other) = delete;


	//允许移动构造和移动赋值
	MiniUnique<T>& operator=(MiniUnique<T>&& other) noexcept
	{
		if (this != &other)
		{
			//先释放自身资源
			delete ptr;
			//依然是release移交所有权
			ptr = other.release();
		}
		return *this;
	}

	//这里的移动构造直接release移交所有权即可
	MiniUnique(MiniUnique<T>&& other) noexcept :ptr(other.release())
	{

	}

	T* get() const noexcept
	{
		return ptr;
	}

	T* release() noexcept
	{
		//放弃所有权
		T* temp = ptr;
		ptr = nullptr;
		return temp;
	}

	void reset(T* p = nullptr)
	{
		if (p != ptr)
		{
			delete ptr;
			ptr = p;
		}
	}

	//重载*和->运算符
	T& operator*() const noexcept
	{
		return *ptr;
	}

	T* operator->() const noexcept
	{
		return ptr;
	}
private:
	T* ptr;
};
```

==没有后台线程，也没有内存扫描，它只是利用了构造、析构、禁用拷贝和移动语义==

用默认删除器时，`unique_ptr<T>` 在常见实现中通常就和一个裸指针一样大，访问对象也没有额外的间接层

所谓零开销，不是说构造和 `delete` 不花时间，而是相比你自己手写的同等管理代码，它不引入引用计数等额外开销（带自定义删除器时体积可能变大，那是进阶话题）

## shared_ptr：共享所有权，最后一个所有者负责释放

接下来换一个情况，多个异步任务都需要独立保存同一个对象，任何一个任务都可能最后完成，不能简单保证谁先退出

这时，让每个任务各持有一份所有权就有意义了

```cpp
//一个所有者
auto a = std::make_shared<int>(10);
//二个所有者
auto b = a;
//还是二个，b放弃了资源所有权
auto c = std::move(b);

//只有c一个所有者
a.reset();
//最后c也放弃资源所有权，资源被释放
c.reset();
```

注意 `auto b = a` 不会再分配一个 `int`，也不会复制整数值来制造另一份独立资源

它复制的是共享管理关系

一个很直接的验证

```cpp
auto a = std::make_shared<int>(10);
auto b = a;
*b = 20;
//*a 也等于 20：它们访问的是同一个 int
```

但编译器怎么知道现在有几个所有者？难道把计数放进 `int` 里吗？

但`int` 并没有给标准库预留计数字段

答案是单独保存管理信息，也就是控制块

### 控制块的作用

常见 `shared_ptr` 实现可以理解成两部分地址信息：

```cpp
//概念示意
T* stored_pointer;          //get() 返回，用来访问对象
ControlBlock* control;     //指向共享管理信息
```

控制块通常要表达强引用计数、弱观察状态，以及最终怎么销毁对象、怎么释放相关存储的策略，具体怎么实现各家标准库不同，不必深究

最关键的一点：**共享同一个{% annotation "共用同一个控制块的那一组 shared_ptr" %}所有权组{% endannotation %}的指针，必须协调同一份管理状态，而不是每个指针各拿一个互不相干的计数器**

复制一个非空 `shared_ptr`，加入这组所有者；移动则转交原来的那份所有权

析构、`reset` 或赋值覆盖旧值，则离开原来的所有权组

这里的计数记录的是强所有者，不是“有多少行代码访问过这个对象”，也不统计从 `get()` 拿出去的裸指针

### 引用计数是怎么加减的

前面说控制块表达强引用计数，**强引用计数就是控制块里的一个整数，记录当前有几个 `shared_ptr` 变量拥有这个对象**

这个数只有一份，存在控制块里，每个 `shared_ptr` 自己不保存计数，只保存指向哪块控制块

后文把强引用计数简称为强计数，`weak_ptr` 对应的观察计数称为弱计数

还是前面那段代码，这次每一步标出强计数

```cpp
auto a = std::make_shared<int>(10);
//新建int对象和一块控制块，控制块里的强计数 = 1（所有者：a）

auto b = a;
//b的拷贝构造函数找到a指向的控制块，把强计数+1，变为2（所有者：a、b）

auto c = std::move(b);
//移动不改计数：所有权从变量b转给变量c，所有者总数没变，还是2（所有者：a、c）
//b变为空，不再是所有者

a.reset();
//a放弃所有权，强计数-1，变为1（所有者：c），不是0，对象不删除

c.reset();
//c放弃所有权，强计数-1，变为0，执行这次减法的操作顺手删除int对象
```

哪些操作会动强计数，汇总成一张表：

| 操作 | 对强计数的影响 |
| --- | --- |
| 拷贝构造 `auto b = a;` | a 所在组 +1，b 成为新所有者 |
| 拷贝赋值 `b = a;` | a 所在组 +1，b 原来所在组 -1 |
| 移动构造 `auto c = std::move(b);` | 不变，所有权从 b 转给 c |
| 移动赋值 `b = std::move(c);` | c 所在组不变，b 原来所在组 -1 |
| 析构、`reset()` | 该变量离开当前组，-1 |
| `get()`、`*p`、`->`、按引用传参 | 不动，借用不产生所有者 |

每次 -1 之后都会检查结果：**谁把强计数减到 0，谁就负责销毁对象**

所以「最后一个所有者负责释放」不是事先指定某个变量，而是由执行最后一次减法的那个操作顺手完成

控制块里有两个计数，各管一件事

- **强计数**决定对象生死：减到 0，对象销毁
- **弱计数**决定控制块生死：对象销毁后，若弱计数也到 0，控制块释放；还有 `weak_ptr` 在观察，控制块就保留，让它们能判断对象已销毁、`lock()` 返回空（`weak_ptr` 后面会专门讲）

至于为什么借用不计数，计数的加减必须挂在有析构时机的对象上，`shared_ptr` 析构时一定会执行 -1

裸指针没有析构函数，离开作用域时没有任何代码通知控制块，如果让它 +1 就永远减不回来，所以借用不计数，代价是借用者自己保证有效期

### 同一个地址，为什么不能重新包装？

```cpp
int* raw = new int(12);
std::shared_ptr<int> p1(raw);
//这里是错误的,p2会另建一个控制块，从裸指针构造一律新建控制块（地址反查不到已有管理）
//那么析构时都会以为自己是唯一的所有者，都会delete，导致重复释放
std::shared_ptr<int> p2(raw);
```

`p1` 和 `p2` 虽然存储相同地址，却各自建立一份管理状态，都认为自己有权在最后执行删除

标准库不会按地址维护一个全局登记表，自动发现这块内存原来已经有人管了

正确做法是复制已有所有者

```cpp
auto a = std::make_shared<int>(42);
auto b = a;
```

同样，不要写 `std::shared_ptr<int> b(a.get());`，也不要把同一个地址同时交给 `unique_ptr` 和一个独立的 `shared_ptr` 管理

如果需要从独占转成共享，可以显式转移

```cpp
auto u = std::make_unique<int>(42);
std::shared_ptr<int> s(std::move(u));
//u 为空，s 成为共享所有者
```

反方向（共享转独占）没有通用的自动接口，日常也基本用不到，这里不展开

### 访问的地址，未必是最终要删除的地址（进阶选读）

这一小节解释控制块为什么要存两个指针，第一遍可以跳过，不影响后面阅读

如果一直只看 `shared_ptr<int>`，你可能会觉得保存两种地址信息有些多余

看看别名构造就知道了

```cpp
struct Whole 
{
    int value = 42;
};

auto owner = std::make_shared<Whole>();
//这里的part是owner的一个共享所有者，owner和part都拥有Whole对象的所有权
//这里的构造参数是一个共享所有者和一个指向资源的裸指针，不新建控制块，与 owner 共享同一份管理状态，只是存储指针指向成员
std::shared_ptr<int> part(owner, &owner->value);

owner.reset();
//此时part仍然拥有Whole对象的所有权，Whole对象不会被释放，*part仍然可以访问Whole对象的value成员
part.reset();
//此时part放弃了Whole对象的所有权，Whole对象的引用计数为0，Whole对象被释放
```

`part.get()` 指向成员，但共享的所有权组管理的是 `Whole`

**访问哪里，由存储指针决定，最后清理什么，由共享管理关系决定**

![shared_ptr 的元素指针、控制块和别名构造](/img/posts/smart-02-control-block.png)

这个工具也有边界，别名指针必须在所维持的生命周期内保持有效，比如指向 `vector` 元素的地址，即使让 `vector` 对象一直存活，也可能因为扩容而失效，让容器存活不等于固定住元素地址

再深一层，别名构造甚至允许「有所有权但存储指针为空」，或者反过来。所以 `if (p)` 判断的是指针非空，不完全等于还有所有权

日常用不到，了解即可

## weak_ptr：观察对象而不延长其生命周期

现在考虑一个观察者，它想知道对象是否还活着，却不希望自己的观察延长对象的生命周期

如果它持有 `shared_ptr`，就已经参与所有权了，但如果只保存裸指针，对象死了它又不知道

这就是 `weak_ptr` 的位置

到这里补一个定义，前面那些真正拥有对象且能决定它生死的 `shared_ptr`，叫**强所有者**（控制块里记的强引用计数就是数它们）

`weak_ptr` 则是**弱观察者**，只看不拥有，不延长对象寿命

```cpp
//弱观察者，暂未观察对象
std::weak_ptr<int> observer;

{
//这里的owner是一个共享所有者，拥有int对象的所有权
auto owner = std::make_shared<int>(10);
//弱观察者指向共享所有者，观察对象的生命周期
observer = owner;

//这里的lock()方法会返回一个shared_ptr
//如果对象还有强所有者，那么lock()返回的shared_ptr会共享所有权，否则返回空的shared_ptr
if (auto hold = observer.lock())
{
int value = *hold;
}
}
//此时owner已经超出作用域被释放，弱观察者观察的对象已经被释放
auto hold = observer.lock();
```

`weak_ptr` 没有 `operator*` 和 `operator->`，不能直接解引用

它的关键能力也不是单纯看一眼对象有没有被销毁，而是通过 `lock()` 原子地尝试取得一份强所有权

成功就用返回的 `shared_ptr` 维持对象存活，失败就得到空指针

==注意这里的「原子」针对的是获得所有权这件事，不代表对象里的业务字段自动变成线程安全==

### 为什么不能先 expired，再访问？

因为检查时活着，不等于下一行执行时还活着

```cpp
//不要把 expired() 当作后续操作成功的保证
if (!observer.expired()) {
    //此时其他线程仍可能释放最后一个强所有者
}

//直接尝试取得所有权，并检查实际结果
if (auto hold = observer.lock()) {
    //使用 hold，而不是检查前保存的裸指针
}
```

`lock()` 也不会复活已经结束生命周期的对象，强所有权已经归零，就不能再凭一个弱观察者把它拉回来

那么对象没了以后，`weak_ptr` 怎么知道它没了？

答案是控制块还可以继续活着

**对象的生命周期和共享管理信息的生命周期，是两件事**

最后一个强所有者退出时，执行对象清理，如果仍有弱观察者，就保留必要管理状态，让它们能够安全判断销毁，尝试 `lock()`

当这些管理信息也不再被需要时，再释放控制块

![weak_ptr 通过 lock 安全取得临时共享所有权](/img/posts/smart-04-weak.png)

## 全用了智能指针，为什么还是泄漏？

看下面这段看起来很「现代」的代码：

```cpp
struct Node
{
    std::shared_ptr<Node> next;
};

{
    auto a = std::make_shared<Node>();
    auto b = std::make_shared<Node>();

    a->next = b;
    b->next = a;
}
```

离开作用域，局部变量 `a` 和 `b` 都析构了，两个节点会一起销毁吗？

不会

局部变量退出前，每个节点都有两个强所有者，一个来自外部变量，另一个来自对方成员

外部变量退出后，每个节点还剩一个来自对方的强所有者

A 没有析构，所以 A 里面持有 B 的 `shared_ptr` 不析构

B 没有析构，所以 B 里面持有 A 的 `shared_ptr` 也不析构

这里没有线程，也没有谁在等待互斥锁，它是循环所有权导致的泄漏，不应混称为线程死锁

### 引用计数不判断对象的可达性

人一眼就能看出这两个节点已经没用了，引用计数却只知道每个节点还剩一个所有者

它没有负责遍历整个对象图，从根开始判断哪些对象不可达

==解决方法不是把计数器设计得更复杂，而是把所有权关系设计正确==

例如父节点拥有子节点，但子节点只是知道父节点是谁

```cpp
#include <memory>
#include <vector>

struct Node 
{
    std::vector<std::shared_ptr<Node>> children;
    std::weak_ptr<Node> parent;
};

auto root = std::make_shared<Node>();
auto child = std::make_shared<Node>();

root->children.push_back(child);
child->parent = root;
```

父到子是拥有，子到父是观察，强所有权环就没有形成

![循环 shared_ptr 所有权以及用 weak_ptr 打破循环](/img/posts/smart-03-cycle.png)

在只有一个简单环的示例里，削弱一条边就能破环

复杂图可能有多个强引用环，不能随便改一处就宣布修复

也不是所有带环的图都要让节点互相 `shared_ptr`

还可以由容器集中拥有节点，节点之间用 ID、索引或生命周期受控的非拥有指针表达关系

**数据关系可以有环，拥有关系不必照着每条数据关系原样复制**

## 函数参数：按所有权语义选择传参方式

三种工具都已介绍，现在回头看接口设计，这一节是收尾，读完即可掌握智能指针的日常用法

如果函数只是同步读取一个对象，不保存地址也不决定生命周期

```cpp
void inspect(const Widget& value);
```

如果允许没有对象，可以用非拥有指针表达

```cpp
void inspectOptional(const Widget* value);
```

如果函数要接走独占所有权

```cpp
void consume(std::unique_ptr<Widget> value);

//consume(std::move(owner));
```

如果函数要参与共享所有权，比如把对象保存在异步任务中

```cpp
void schedule(std::shared_ptr<Widget> value);
```

如果需要修改调用方的智能指针变量，让它改管另一个对象，才考虑智能指针的非常量引用

不是参数里出现智能指针才叫现代 C++

一个只是读取数据的函数，接收 `const Widget&`，通常比要求调用方提供 `shared_ptr<Widget>` 更直接，也不把调用方的所有权方案绑死

### const 智能指针不等于 const 对象

```cpp
const auto p = std::make_unique<int>(10);
*p = 20; //不能重新安排 p 的所有权，不代表 int 不可修改

std::unique_ptr<const int> q = std::make_unique<int>(10);
//*q = 20; 
//通过 q 看到的是 const int
```

`const std::shared_ptr<T>&` 也不自动提供一份独立维持对象存活的副本

如果函数调用过程中可能通过其他路径重置原来的所有者，需要在合适位置先复制一份本地 `shared_ptr`，再借用对象进行调用

选择按值还是按引用，先看你要表达的生命周期语义，再考虑减少哪一次计数操作

## make_shared：通常少一次分配，但理由要准确

日常创建用 `make_unique` / `make_shared` 这个结论，前面其实一直在用

本节解释为什么，以及几个容易说错的细节，第一遍记住推荐用 make_shared即可，异常安全、合并分配代价等进阶细节可以跳过

推荐写法是这样：

```cpp
auto u = std::make_unique<Widget>(args...);
auto s = std::make_shared<Widget>(args...);
```

`make_shared` 从 `C++11` 就有，`make_unique` 从 `C++14` 加入标准库

直接写 `std::shared_ptr<T>(new T)` 时，对象存储已经由 `new T` 分配，标准库通常还要分配控制块

`make_shared<T>` 则可以在一次分配中同时容纳控制块和对象，常见实现正是这样做的，标准草案也建议实现不超过一次内存分配

好处是减少分配管理开销，可能改善局部性，也让对象创建和建立所有权写在同一个表达式里

实际收益取决于分配器、对象大小、缓存行为和使用方式

### 控制块分配失败，裸 new 写法一定会泄漏吗？（进阶）

不会，这是个常被说反的点

```cpp
std::shared_ptr<Widget> p(new Widget);
```

如果对象构造成功、随后分配控制块失败，标准要求清理传入的对象，不会直接泄漏

真正经典的旧问题在 `C++17` 之前：复杂函数调用里各参数的求值可能交错

```cpp
consume(std::shared_ptr<Widget>(new Widget), mayThrow());
```

旧规则下可能先 `new Widget`，再执行会抛异常的 `mayThrow()`，此时管理者还没构造，对象就泄漏了

`make_shared` 把分配和建立管理放进一次函数调用，避开了这个窗口

`C++17` 起参数初始化之间不再允许这种交错（谁先谁后仍未固定），所以这个例子不能不加说明地当作现代 C++ 必然泄漏的证据

### 合并分配有没有代价？（进阶）

有，最典型的就是长寿命 `weak_ptr`

当强所有者全部退出时，`make_shared` 创建的对象仍然会按时析构，不会因为弱观察者还在，就推迟对象析构

但是对象和控制块合并占用的那一整块存储，可能要等弱观察者也结束后才能归还

所以应区分：对象已析构、对象内部资源已清理、承载对象的整块存储已归还

例如对象内部的 `vector` 在对象析构时就会释放自己的缓冲区

如果对象自身内嵌巨大数组，那么合并存储保留就可能占住相当多空间

另外，`make_shared` 不接受自定义删除器。如果你需要定制清理动作，或依赖特定的内存分配路径，就改用 `shared_ptr<T>(new T)` 的写法

## 文件、数组、继承的清理规则（进阶）

智能指针的清理动作不必永远是 `delete`

```cpp
#include <cstdio>
#include <memory>

struct FileCloser {
    void operator()(std::FILE* f) const noexcept {
        if (f) std::fclose(f);
    }
};

using FilePtr = std::unique_ptr<std::FILE, FileCloser>;

FilePtr file(std::fopen("data.txt", "r"));
if (!file) {
    // 处理打开失败
}
// 成功打开时，离开作用域自动 fclose
```

这只是最基本的关闭管理，`fclose` 本身可能报告错误，如果业务必须处理写回或关闭失败，应设计显式的提交/关闭与错误检查，不能指望析构函数替你可靠上报业务错误

删除器应按接口要求安全工作，不要从清理路径抛异常

`unique_ptr` 的删除器类型是自身类型的一部分

`shared_ptr` 则将删除策略放进共享管理机制，不同删除器仍可以得到同样的 `shared_ptr<T>` 类型

### 数组需要匹配数组的清理方式

```cpp
auto a = std::make_unique<int[]>(100);  // C++14
a[0] = 42;

std::shared_ptr<int[]> b(new int[100]{}); // C++17
b[0] = 42;

// C++20 起才可以这样用 make_shared 创建数组
// auto c = std::make_shared<int[]>(100);
```

不能把 `new T[n]` 随便交给默认按单个对象删除的 `unique_ptr<T>`

`delete` 和 `delete[]` 不匹配是未定义行为

日常动态数组通常优先考虑 `std::vector<T>`，因为它还表达了大小、支持迭代，并管理增长过程

智能数组指针并不等于一个功能齐全的容器

### 基类指针为什么还需要虚析构？

```cpp
struct Base {
    virtual ~Base() = default;
};

struct Derived : Base {};

std::unique_ptr<Base> p = std::make_unique<Derived>();
```

当用 `unique_ptr<Base>` 的默认删除器通过 `Base*` 删除派生对象时，通常的多态基类需要虚析构函数，智能指针不会改变普通 `delete` 的类型规则

`shared_ptr` 有个差别：用 `make_shared<Derived>()` 建立所有权时，它记住了派生类型的销毁方式，之后转成 `shared_ptr<Base>` 也能正确销毁，这条路径不依赖虚析构

但这只是某一条构造路径的便利：工程中多态基类该有虚析构仍要有，不能以此替代正常的类设计

## 不要用 shared_ptr(this)：enable_shared_from_this（进阶）

异步任务里经常有一种需求：对象希望把自己交给稍后执行的回调，以免回调触发时对象已经销毁

于是有人写：

```cpp
// 错误思路：return std::shared_ptr<Session>(this);
```

如果这个对象已经由其他 `shared_ptr` 管理，这又建立了一套独立的管理状态，和前面重复包装同一裸地址的问题完全一样

正确工具是 `enable_shared_from_this`

```cpp
#include <functional>
#include <memory>

class Session : public std::enable_shared_from_this<Session> {
public:
    std::function<void()> makeTask() {
        auto self = shared_from_this();
        return [self] {
            self->run();
        };
    }

private:
    void run() {}
};

auto session = std::make_shared<Session>();
auto task = session->makeTask();
session.reset();
task(); // 回调持有的 self 仍维持 Session 存活
```

它的思路可以理解为：类内部保存一份弱观察状态，在对象被兼容的 `shared_ptr` 正确接管时关联已有所有权组。`shared_from_this()` 再从这组关系中取得强所有权，不另造一个控制块

继承要使用公开、无歧义的合适基类，并且调用时对象已经由共享所有权管理

仅仅继承这个模板，不会让一个普通局部对象自动加入共享管理

```cpp
Session local;
// local.makeTask(); // 在这里 shared_from_this() 会抛 std::bad_weak_ptr
```

也别在构造函数里立刻调用 `shared_from_this()`，即使用 `make_shared` 创建对象，构造函数执行期间内部关联也尚未建立

### 回调也可能形成循环引用

上面的例子将回调交给外部持有，所以它可以按需要维持会话存活

如果对象又把捕获 `self` 的回调存进自己的成员，就形成了：

`Session → 回调 → shared_ptr<Session> → Session`

即使没有两个互相指向的类，环仍然存在

如果业务语义是对象活着就执行，不要求回调延长它的生命，可以改成弱捕获：

```cpp
std::function<void()> makeOptionalTask() {
    auto weak = weak_from_this();  // C++17，作为 Session 的成员函数
    return [weak] {
        if (auto self = weak.lock()) {
            self->run();
        }
    };
}
```

对象已销毁时，这个回调就不再执行相应操作。是否允许这样跳过任务，需要由业务决定，不能为了消除泄漏而擅自改变任务语义

## 引用计数线程安全，为什么程序还会出问题？（进阶）

这也是面试中容易回答不完整的问题

“`shared_ptr` 是线程安全的吗？”

先别急着答是或不是，你说的是哪一层？

### 第一层：不同指针对象，共享同一个控制块

```cpp
auto a = std::make_shared<int>(42);
auto b = a;

// 线程 1：a.reset();
// 线程 2：b.reset();
```

在正确发布这些对象、且各线程分别操作自己的指针实例的前提下，共享管理状态的协调由标准库保证，不会因为两个线程同时退出就重复删除对象

引用计数通常借助原子操作或实现提供的等价同步机制完成

### 第二层：多个线程访问同一个 shared_ptr 变量

```cpp
std::shared_ptr<int> current = std::make_shared<int>(42);

// 线程 1：auto local = current;
// 线程 2：current.reset();
```

这里读写的是同一个 `current` 对象，不是两个独立实例。缺少同步就可能发生数据竞争

你可以用互斥锁保护它，`C++20` 起也可以使用 `std::atomic<std::shared_ptr<T>>` 专门管理这个共享指针变量的原子读写，但不保证它在所有平台上都无锁

```cpp
// C++20；需要 <atomic> 和 <memory>
std::atomic<std::shared_ptr<const Config>> current;

void publish() {
    current.store(std::make_shared<Config>());
}

void readConfig() {
    auto snapshot = current.load();
    if (snapshot) {
        // 在 snapshot 维持生命周期期间读取配置
    }
}
```


### 第三层：被管理对象本身

```cpp
auto a = std::make_shared<int>(0);
auto b = a;

// 线程 1：++*a;
// 线程 2：++*b;
```

两份指针管理关系没出问题，指向的却是同一个普通 `int`，无同步并发修改仍然是数据竞争

需要用锁、原子业务字段或其他合适的同步设计

**控制块的安全、指针变量的安全、业务数据的安全，是三个问题**

顺便提醒，`use_count()` 不是并发锁，看见计数为 1，不代表后面不会有其他线程通过弱观察者取得强所有权，也不代表不存在裸指针或引用访问这份数据

最后一个所有者可能在哪个线程退出，对象的清理通常就在哪个线程发生

如果资源要求在特定线程释放，或者析构过程很重，还需要额外设计销毁调度

## 小结

不妨把开头的问题再问一遍

为什么 `unique_ptr` 不允许复制？因为复制独占所有权会制造两个释放责任人，所以用类型系统禁止，再通过移动完成交接

为什么 `shared_ptr` 需要控制块？因为多个所有者需要协调同一份生命周期状态，而且删除策略不能总从当前存储指针的类型和地址直接推出

为什么 `weak_ptr` 不直接提供解引用？因为不延长生命周期的观察者，不能凭一个地址保证下一刻对象还活着，所以先 `lock()`，再使用拿到的强所有者

为什么用了智能指针仍会泄漏？因为错误的所有权图依然可能有环；管理对象自身也可能被泄漏，`release()` 之后也可能再没人接管

那是不是把所有东西都换成 `shared_ptr` 就足够安全？实际并不是，它会带来控制块、计数协调和额外的生命周期耦合，也不会替你修复数组越界、数据竞争、悬空借用或错误删除策略

**先用普通对象、容器和清晰的成员关系表达生命周期，需要动态独占所有权时用 `unique_ptr`；确实需要多个独立所有者时用 `shared_ptr`；只观察共享对象而不延长其生命周期时用 `weak_ptr`**

开头欠的那张对照表，现在可以补上了：

| 工具 | 表达的关系 | 会不会维持对象生命周期 |
| --- | --- | --- |
| `unique_ptr<T>` | 独占所有权 | 会，直到释放或转交所有权 |
| `shared_ptr<T>` | 共享所有权 | 会，最后一个强所有者退出时清理 |
| `weak_ptr<T>` | 弱观察，不拥有 | 自身不会，访问前用 `lock()` 取得强所有权 |
| `T*`、`T&` | 借用 | 不会，由调用方保证有效期 |

理解智能指针之后，每次保存一个地址时，都能回答清楚：它由谁拥有，我是在借用还是在接管，以及我使用它的时候，凭什么保证它还活着

## 参考资料

1. C++ Core Guidelines：[资源管理规则](https://isocpp.github.io/CppCoreGuidelines/CppCoreGuidelines#S-resource)，重点参考 R.20—R.24、R.30—R.37
2. 公开 C++ 标准工作草案：[unique_ptr](https://eel.is/c++draft/unique.ptr)、[shared_ptr 构造](https://eel.is/c++draft/util.smartptr.shared.const)与[工厂函数](https://eel.is/c++draft/util.smartptr.shared.create)、[weak_ptr 观察操作](https://eel.is/c++draft/util.smartptr.weak.obs)、[enable_shared_from_this](https://eel.is/c++draft/util.smartptr.enab)、[atomic<shared_ptr>](https://eel.is/c++draft/util.smartptr.atomic)
3. 书籍：《C++ Primer》第五版第 12 章的动态内存内容，《Effective Modern C++》的智能指针专题
4. 视频：部分来源b站
