/* eslint-disable */
import { KeystoneContext } from '@keystone-next/types';
import { OrderCreateInput,CartItemCreateInput } from '../.keystone/schema-types';
import stripeConfig from '../lib/stripe';
import { OrderItem } from '../schemas/OrderItem';
import { Session } from '../types';

const graphql = String.raw;
export default async function checkout(
  root: any,
  { token }: { token: string },
  context: KeystoneContext
): Promise<OrderCreateInput> {
    //1. make sure they're signed in
    const userId = context.session.itemId;
    console.log('token',token);
    if (!userId) {
        throw new Error("Sorry! You must be signed in to create an order");        
    }
    const user = await context.lists.User.findOne({
        where: { id: userId },
        resolveFields: graphql`
            id
            name
            mail
            cart {
                id
                quantity
                product{
                    name
                    price
                    description
                    id
                    photo{
                        id
                        image{
                            id
                            publicUrlTranformed
                        }
                    }
                }

            }
        `
    })

    console.dir(user,{depth:null});
    //2. calculate the total price
   const cartItems = user.cart.filter(cartItem => cartItem.product);
   const amount = cartItems.reduce(function(tally: number, cartItem: CartItemCreateInput) {
    return tally + cartItem.quantity * cartItem.product.price;
  }, 0);
    console.log(amount);
    //3. create the charge with the stripe library
    const charge = await stripeConfig.paymentIntents.create({
        amount,
        currency: 'USD',
        confirm: true,
        payment_method: token
    }).catch(err => {
        console.log(err);
        throw new Error(err.message);
        
    });
    console.log(charge);
    //4. convert the cart items to order items
    const orderItems = cartItems.map(cartItem => {
        const orderItem = {
            name: cartItem.product.name,
            description: cartItem.product.description,
            price: cartItem.product.price,
            quantity: cartItem.quantity,
            photo: { connect: { id: cartItem.product.photo.id } }
          
        }
        return orderItem;
    });
    //5. create the order and return it
    const order = await context.lists.Order.createOne({
        data: {
            total: charge.amount,
            charge: charge.id,
            items: { create: orderItems},
            user:{connect:{id:userId}}
        }
    })

    //6. clean up any old cart items
    const cartItemIds = user.cart.map(cartItem => cartItem.id);
    await context.lists.CartItem.deleteMany({
        ids: cartItemIds
    });
    return order;
}
